import { vi } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { Redis } from 'ioredis';

/**
 * Mock Redis instance for testing
 * Uses in-memory Map to simulate Redis operations
 */
export class MockRedis {
  private store = new Map<string, { value: string; expiry?: number }>();

  get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return Promise.resolve(null);

    // Check expiry
    if (item.expiry && Date.now() > item.expiry) {
      this.store.delete(key);
      return Promise.resolve(null);
    }

    return Promise.resolve(item.value);
  }

  set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, { value });
    return Promise.resolve('OK');
  }

  setex(key: string, seconds: number, value: string): Promise<'OK'> {
    const expiry = Date.now() + seconds * 1000;
    this.store.set(key, { value, expiry });
    return Promise.resolve('OK');
  }

  del(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.delete(key)) count++;
    }
    return Promise.resolve(count);
  }

  incr(key: string): Promise<number> {
    const item = this.store.get(key);
    const current = item ? parseInt(item.value, 10) : 0;
    const newValue = current + 1;
    this.store.set(key, { value: String(newValue) });
    return Promise.resolve(newValue);
  }

  expire(key: string, seconds: number): Promise<number> {
    const item = this.store.get(key);
    if (!item) return Promise.resolve(0);

    const expiry = Date.now() + seconds * 1000;
    this.store.set(key, { ...item, expiry });
    return Promise.resolve(1);
  }

  exists(...keys: string[]): Promise<number> {
    let count = 0;
    for (const key of keys) {
      if (this.store.has(key)) count++;
    }
    return Promise.resolve(count);
  }

  keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const matchingKeys = Array.from(this.store.keys()).filter((key) => regex.test(key));
    return Promise.resolve(matchingKeys);
  }

  flushall(): Promise<'OK'> {
    this.store.clear();
    return Promise.resolve('OK');
  }

  flushdb(): Promise<'OK'> {
    this.store.clear();
    return Promise.resolve('OK');
  }

  /**
   * Clear all stored data (for test cleanup)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get all keys (for debugging)
   */
  getAllKeys(): string[] {
    return Array.from(this.store.keys());
  }

  /**
   * Get store size (for assertions)
   */
  size(): number {
    return this.store.size;
  }
}

/**
 * Create a mock Redis instance using vitest-mock-extended
 * This provides full type safety and spy functionality
 */
export function createMockRedis(): DeepMockProxy<Redis> {
  const mock = mockDeep<Redis>();

  // Default implementations
  mock.get.mockResolvedValue(null);
  mock.set.mockResolvedValue('OK');
  mock.setex.mockResolvedValue('OK');
  mock.del.mockResolvedValue(1);
  mock.incr.mockResolvedValue(1);
  mock.expire.mockResolvedValue(1);

  return mock;
}

/**
 * Create a functional mock Redis with in-memory storage
 * Use this when you need Redis behavior (caching, expiry, etc.)
 */
export function createFunctionalMockRedis(): MockRedis {
  return new MockRedis();
}

/**
 * Reset a mock Redis instance
 */
export function resetMockRedis(redis: DeepMockProxy<Redis>): void {
  mockReset(redis);

  // Restore default implementations
  redis.get.mockResolvedValue(null);
  redis.set.mockResolvedValue('OK');
  redis.setex.mockResolvedValue('OK');
  redis.del.mockResolvedValue(1);
  redis.incr.mockResolvedValue(1);
  redis.expire.mockResolvedValue(1);
}
