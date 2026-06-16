import {promises as dns} from 'dns';
import {run} from '@zootools/email-spell-checker';
import type {EmailVerificationResult} from '@plunk/types';
import {redis} from '../database/redis.js';

const DISPOSABLE_DOMAINS_URL =
  'https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf';
const DISPOSABLE_DOMAINS_CACHE_KEY = 'email:disposable_domains';
const PERSONAL_DOMAINS_URL =
  'https://gist.githubusercontent.com/ammarshah/f5c2624d767f91a7cbdc4e54db8dd0bf/raw/660fd949eba09c0b86574d9d3aa0f2137161fc7c/all_email_provider_domains.txt';
const PERSONAL_DOMAINS_CACHE_KEY = 'email:personal_domains';
const CACHE_TTL_SECONDS = 24 * 60 * 60; // 24 hours (list updates daily)

// Known email forwarding/alias services
const FORWARDING_DOMAINS = new Set([
  'privaterelay.appleid.com', // Apple Sign In
  'mozmail.com', // Firefox Relay
  'simplelogin.com', // SimpleLogin
  'simplelogin.fr',
  'simplelogin.co',
  'simplelogin.io',
  'aleeas.com',
  'slmail.me',
  'dralias.com',
  '8shield.net',
  'anonaddy.com', // Addy.io
  'anonaddy.me',
  'addy.io',
  'duck.com', // DuckDuckGo
  '33mail.com', // 33mail
  '33m.co',
  'passmail.com', // Proton Pass
  'passmail.net',
  'passinbox.com',
  'passfwd.com',
  'y.yo.fr',
  'opayq.com', // IronVest (formerly Blur)
  'cloak.id', // Cloaked
  'erine.email', // Erine
  'use.startmail.com', // StartMail
]);

export class EmailVerificationService {
  private static disposableDomainsSet: Set<string> | null = null;
  private static personalDomainsSet: Set<string> | null = null;

  /**
   * Verify an email address
   * - Checks for NS records (proves domain exists in DNS)
   * - Checks for MX records (required for receiving email)
   * - Checks for A/AAAA records (informational - indicates if domain has a website)
   * - Detects disposable email addresses
   * - Detects personal/free email providers (Gmail, Hotmail, etc.)
   * - Detects forwarding/alias email addresses
   * - Suggests corrections for common typos
   */
  static async verifyEmail(email: string): Promise<EmailVerificationResult> {
    const result: EmailVerificationResult = {
      email,
      valid: true,
      isDisposable: false,
      isAlias: false,
      isTypo: false,
      isPlusAddressed: false,
      isPersonalEmail: false,
      domainExists: false,
      hasWebsite: false,
      hasMxRecords: false,
      reasons: [],
    };

    // Extract domain from email
    const emailParts = email.split('@');
    if (emailParts.length !== 2) {
      result.valid = false;
      result.reasons.push('Invalid email format');
      return result;
    }

    const domain = emailParts[1]!; // Safe to assert, we already validated length

    // Check if email is from a disposable domain using GitHub list
    result.isDisposable = await this.isDisposableDomain(domain);

    // Check if email is from a personal/free email provider
    result.isPersonalEmail = await this.isPersonalEmailDomain(domain);

    // Check if email is from a known forwarding/alias service
    result.isAlias = this.isForwardingDomain(domain);

    // Check for plus addressing
    result.isPlusAddressed = emailParts[0]!.includes('+');

    // Check for common typos and suggest corrections
    const typoCheck = run({email});
    if (typoCheck && typoCheck.address && typoCheck.address !== email) {
      result.suggestedEmail = typoCheck.full;
      result.reasons.push(`Possible typo detected, did you mean ${typoCheck.domain}?`);
      result.isTypo = true;
    }

    // Step 1: Check NS records - proves the domain exists in DNS
    try {
      const nsRecords = await dns.resolveNs(domain);
      result.domainExists = nsRecords && nsRecords.length > 0;
    } catch {
      result.domainExists = false;
      result.valid = false;
      result.reasons.push('Domain does not exist (no nameservers found)');
      // If domain doesn't exist, no point checking MX/A records
      return result;
    }

    // Step 2: Check MX records - required for receiving email
    try {
      const mxRecords = await dns.resolveMx(domain);
      result.hasMxRecords = mxRecords && mxRecords.length > 0;
      if (!result.hasMxRecords) {
        result.valid = false;
        result.reasons.push('Domain cannot receive email (no MX records found)');
      }
    } catch {
      result.hasMxRecords = false;
      result.valid = false;
      result.reasons.push('Domain cannot receive email (no MX records found)');
    }

    // Step 3: Check if domain has A/AAAA records - informational only
    // This indicates if the domain has a website/web server
    // Doesn't affect email validity since email only requires MX records
    try {
      await dns.resolve(domain, 'A');
      result.hasWebsite = true;
    } catch {
      // Try AAAA records if A records fail
      try {
        await dns.resolve(domain, 'AAAA');
        result.hasWebsite = true;
      } catch {
        // Domain doesn't have A/AAAA records (no website), but this is OK for email
        result.hasWebsite = false;
      }
    }

    // If no issues were found, add a success reason
    if (result.valid && result.reasons.length === 0) {
      result.reasons.push('Email appears to be valid');
    }

    return result;
  }

  /**
   * Fetch and cache the disposable domains list from GitHub
   * Uses Redis for caching with 24-hour TTL
   * Falls back to in-memory cache if Redis fails
   */
  private static async getDisposableDomains(): Promise<Set<string>> {
    // Return in-memory cache if available
    if (this.disposableDomainsSet) {
      return this.disposableDomainsSet;
    }

    try {
      // Try to get from Redis cache first
      const cached = await redis.get(DISPOSABLE_DOMAINS_CACHE_KEY);
      if (cached) {
        const domains = JSON.parse(cached) as string[];
        this.disposableDomainsSet = new Set(domains);
        return this.disposableDomainsSet;
      }

      // Fetch from GitHub if not in cache
      const response = await fetch(DISPOSABLE_DOMAINS_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch disposable domains: ${response.statusText}`);
      }

      const text = await response.text();
      const domains = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#')); // Filter empty lines and comments

      // Cache in Redis
      await redis.set(DISPOSABLE_DOMAINS_CACHE_KEY, JSON.stringify(domains), 'EX', CACHE_TTL_SECONDS);

      // Cache in memory
      this.disposableDomainsSet = new Set(domains);
      return this.disposableDomainsSet;
    } catch (error) {
      console.error('Error fetching disposable domains:', error);
      // Return empty set as fallback - don't block email verification
      return new Set<string>();
    }
  }

  /**
   * Check if a domain is disposable
   */
  private static async isDisposableDomain(domain: string): Promise<boolean> {
    const disposableDomains = await this.getDisposableDomains();
    return disposableDomains.has(domain.toLowerCase());
  }

  /**
   * Check if a domain is a known forwarding/alias service
   */
  private static isForwardingDomain(domain: string): boolean {
    return FORWARDING_DOMAINS.has(domain.toLowerCase());
  }

  /**
   * Fetch and cache the personal email domains list from GitHub
   * Uses Redis for caching with 24-hour TTL
   * Falls back to in-memory cache if Redis fails
   */
  private static async getPersonalEmailDomains(): Promise<Set<string>> {
    // Return in-memory cache if available
    if (this.personalDomainsSet) {
      return this.personalDomainsSet;
    }

    try {
      // Try to get from Redis cache first
      const cached = await redis.get(PERSONAL_DOMAINS_CACHE_KEY);
      if (cached) {
        const domains = JSON.parse(cached) as string[];
        this.personalDomainsSet = new Set(domains);
        return this.personalDomainsSet;
      }

      // Fetch from GitHub if not in cache
      const response = await fetch(PERSONAL_DOMAINS_URL);
      if (!response.ok) {
        throw new Error(`Failed to fetch personal email domains: ${response.statusText}`);
      }

      const text = await response.text();
      const domains = text
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#')); // Filter empty lines and comments

      // Cache in Redis
      await redis.set(PERSONAL_DOMAINS_CACHE_KEY, JSON.stringify(domains), 'EX', CACHE_TTL_SECONDS);

      // Cache in memory
      this.personalDomainsSet = new Set(domains);
      return this.personalDomainsSet;
    } catch (error) {
      console.error('Error fetching personal email domains:', error);
      // Return empty set as fallback - don't block email verification
      return new Set<string>();
    }
  }

  /**
   * Check if a domain is a personal/free email provider
   */
  private static async isPersonalEmailDomain(domain: string): Promise<boolean> {
    const personalDomains = await this.getPersonalEmailDomains();
    return personalDomains.has(domain.toLowerCase());
  }
}
