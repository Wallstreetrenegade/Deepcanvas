/**
 * Billing and usage limit types
 */

/**
 * Usage information for a specific email category
 */
export interface CategoryUsage {
  limit: number | null; // null = unlimited
  usage: number;
  percentage: number; // 0-100
  isWarning: boolean; // true if >= 80%
  isBlocked: boolean; // true if >= 100%
}

/**
 * Complete billing limits and usage for a project
 */
export interface BillingLimitsResponse {
  workflows: CategoryUsage;
  campaigns: CategoryUsage;
  transactional: CategoryUsage;
  inbound: CategoryUsage;
  currency: string | null;
}

/**
 * Result of limit check
 */
export interface LimitCheckResult {
  allowed: boolean;
  warning: boolean; // true if >= 80% but < 100%
  usage: number;
  limit: number | null;
  percentage: number;
  message?: string;
}
