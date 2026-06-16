import signale from 'signale';

import {STRIPE_ENABLED} from '../app/constants.js';
import {QueueService} from './QueueService.js';

export class MeterService {
  public static async recordEmailSent(customerId: string, value = 1, idempotencyKey?: string): Promise<void> {
    if (!STRIPE_ENABLED) {
      return;
    }

    if (!customerId) {
      return;
    }

    try {
      await QueueService.queueMeterEvent(customerId, value, idempotencyKey);
    } catch (error) {
      signale.error('[METER] Failed to enqueue meter event:', error);
    }
  }

  public static async recordEmailBatch(customerId: string, count: number, batchId: string): Promise<void> {
    if (count <= 0) return;

    await this.recordEmailSent(customerId, count, `batch_${batchId}`);
  }
}
