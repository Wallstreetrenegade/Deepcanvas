/**
 * Security and project health types
 */

export interface SecurityRateData {
  total: number;
  bounces: number;
  complaints: number;
  bounceRate: number;
  complaintRate: number;
}

export interface SecurityStatus {
  projectId: string;
  isHealthy: boolean;
  shouldDisable: boolean;
  twentyFourHour: SecurityRateData;
  sevenDay: SecurityRateData;
  allTime: SecurityRateData;
  isNewProject: boolean;
  violations: string[];
  warnings: string[];
}

export type SecurityLevel = 'healthy' | 'warning' | 'critical';

export interface SecurityMetricLevels {
  bounce7Day: SecurityLevel;
  bounceAllTime: SecurityLevel;
  complaint7Day: SecurityLevel;
  complaintAllTime: SecurityLevel;
}

export interface ProjectSecurityMetrics {
  status: SecurityStatus;
  levels: SecurityMetricLevels;
  isDisabled: boolean;
}
