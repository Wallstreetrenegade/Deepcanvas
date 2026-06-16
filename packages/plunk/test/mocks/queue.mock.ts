import { vi } from 'vitest';
import { mockDeep, type DeepMockProxy } from 'vitest-mock-extended';
import type { Queue, Job } from 'bullmq';

/**
 * In-memory queue implementation for testing
 * Provides realistic queue behavior without Redis
 */
export class MockQueueStore<T = any> {
  private jobs = new Map<string, MockJobData<T>>();
  private jobCounter = 0;

  async add(name: string | T, data?: T | any, opts?: any): Promise<MockJobData<T>> {
    const jobName = typeof name === 'string' ? name : undefined;
    const jobData = typeof name === 'string' ? data : name;
    const jobOpts = typeof name === 'string' ? opts : data;

    const jobId = jobOpts?.jobId || `job-${++this.jobCounter}`;

    const job: MockJobData<T> = {
      id: jobId,
      name: jobName,
      data: jobData,
      opts: jobOpts,
      state: 'waiting',
      attemptsMade: 0,
      timestamp: Date.now(),
      processedOn: undefined,
      finishedOn: undefined,
      returnvalue: undefined,
      failedReason: undefined,
    };

    this.jobs.set(jobId, job);
    return job;
  }

  async getJob(jobId: string): Promise<MockJobData<T> | null> {
    return this.jobs.get(jobId) || null;
  }

  async getJobs(states: string[]): Promise<MockJobData<T>[]> {
    return Array.from(this.jobs.values()).filter((job) => states.includes(job.state));
  }

  async getJobCounts(...states: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const state of states) {
      counts[state] = Array.from(this.jobs.values()).filter((j) => j.state === state).length;
    }
    return counts;
  }

  async removeJob(jobId: string): Promise<void> {
    this.jobs.delete(jobId);
  }

  async pause(): Promise<void> {
    // No-op for mock
  }

  async resume(): Promise<void> {
    // No-op for mock
  }

  async clean(grace: number, limit: number, type: string): Promise<string[]> {
    const now = Date.now();
    const removed: string[] = [];

    for (const [jobId, job] of this.jobs.entries()) {
      if (job.state === type && job.finishedOn && now - job.finishedOn > grace) {
        this.jobs.delete(jobId);
        removed.push(jobId);
        if (removed.length >= limit) break;
      }
    }

    return removed;
  }

  async close(): Promise<void> {
    this.jobs.clear();
  }

  // Test utilities
  getAllJobs(): MockJobData<T>[] {
    return Array.from(this.jobs.values());
  }

  getJobsByName(name: string): MockJobData<T>[] {
    return Array.from(this.jobs.values()).filter((job) => job.name === name);
  }

  clear(): void {
    this.jobs.clear();
    this.jobCounter = 0;
  }

  size(): number {
    return this.jobs.size;
  }

  markJobAsCompleted(jobId: string, returnvalue?: any): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.state = 'completed';
      job.finishedOn = Date.now();
      job.returnvalue = returnvalue;
    }
  }

  markJobAsFailed(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.state = 'failed';
      job.finishedOn = Date.now();
      job.failedReason = error;
    }
  }
}

export interface MockJobData<T = any> {
  id: string;
  name?: string;
  data: T;
  opts?: any;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  returnvalue?: any;
  failedReason?: string;
}

/**
 * Create mock BullMQ queues for testing
 */
export function createMockQueues() {
  return {
    email: new MockQueueStore(),
    campaign: new MockQueueStore(),
    workflow: new MockQueueStore(),
    scheduled: new MockQueueStore(),
    import: new MockQueueStore(),
    segmentCount: new MockQueueStore(),
    domainVerification: new MockQueueStore(),
  };
}

/**
 * Create a typed mock queue using vitest-mock-extended
 */
export function createMockQueue<T = any>(): DeepMockProxy<Queue<T>> {
  const mock = mockDeep<Queue<T>>();

  // Default implementations
  mock.add.mockImplementation(async (name, data, opts) => {
    return {
      id: opts?.jobId || `mock-job-${Date.now()}`,
      data: (typeof name === 'string' ? data : name) as T,
      attemptsMade: 0,
    } as unknown as Job<T>;
  });

  mock.getJob.mockResolvedValue(null);
  mock.getJobs.mockResolvedValue([]);
  mock.getJobCounts.mockResolvedValue({
    waiting: 0,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
  });
  mock.pause.mockResolvedValue(undefined);
  mock.resume.mockResolvedValue(undefined);
  mock.close.mockResolvedValue(undefined);

  return mock;
}
