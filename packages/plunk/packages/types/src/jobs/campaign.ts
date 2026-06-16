/**
 * Campaign queue job data types
 */

/**
 * Job data for processing a batch of campaign recipients
 * Used by: campaignQueue worker
 */
export interface CampaignBatchJobData {
  campaignId: string;
  batchNumber: number;
  offset: number;
  limit: number;
  cursor?: string; // For cursor-based pagination
}

/**
 * Job data for sending a scheduled campaign
 * Used by: scheduledQueue worker
 */
export interface ScheduledCampaignJobData {
  campaignId: string;
}
