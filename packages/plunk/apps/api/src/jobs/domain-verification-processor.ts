/**
 * Domain Verification Worker
 * Processes domain verification jobs from the BullMQ queue
 */

import type {DomainVerificationJobData} from '@plunk/types';
import {type Job, Worker} from 'bullmq';
import signale from 'signale';

import {domainVerificationQueue} from '../services/QueueService.js';

import {checkDomainVerifications} from './domain-verification.js';

/**
 * Process domain verification job
 */
async function processDomainVerification(job: Job<DomainVerificationJobData>): Promise<void> {
  signale.info(`[DOMAIN-VERIFICATION-WORKER] Starting domain verification job ${job.id}`);

  try {
    await checkDomainVerifications();
    signale.success(`[DOMAIN-VERIFICATION-WORKER] Completed domain verification job ${job.id}`);
  } catch (error) {
    signale.error(`[DOMAIN-VERIFICATION-WORKER] Error processing job ${job.id}:`, error);
    throw error; // Re-throw to trigger retry
  }
}

/**
 * Create and export the domain verification worker
 */
export function createDomainVerificationWorker(): Worker {
  const worker = new Worker<DomainVerificationJobData>(
    domainVerificationQueue.name,
    async (job: Job<DomainVerificationJobData>) => {
      await processDomainVerification(job);
    },
    {
      connection: domainVerificationQueue.opts.connection,
      concurrency: 1, // Process one domain verification job at a time
      limiter: {
        max: 1, // Max 1 job per duration
        duration: 60000, // Per minute (prevents rapid-fire verification checks)
      },
    },
  );

  worker.on('completed', job => {
    signale.success(`[DOMAIN-VERIFICATION-WORKER] Job ${job.id} completed`);
  });

  worker.on('failed', (job, error) => {
    signale.error(`[DOMAIN-VERIFICATION-WORKER] Job ${job?.id} failed:`, error);
  });

  worker.on('error', error => {
    signale.error('[DOMAIN-VERIFICATION-WORKER] Worker error:', error);
  });

  return worker;
}
