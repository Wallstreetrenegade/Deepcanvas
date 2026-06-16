/**
 * Email verification types
 */

/**
 * Result of email address verification
 */
export interface EmailVerificationResult {
  email: string;
  valid: boolean;
  isDisposable: boolean;
  isAlias: boolean;
  isTypo: boolean;
  isPlusAddressed: boolean;
  isPersonalEmail: boolean; // Email is from a personal/free provider (Gmail, Hotmail, etc.)
  domainExists: boolean; // Domain exists in DNS (has NS records)
  hasWebsite: boolean; // Domain has A/AAAA records (informational - not required for email)
  hasMxRecords: boolean; // Domain has MX records (required for receiving email)
  suggestedEmail?: string;
  reasons: string[];
}
