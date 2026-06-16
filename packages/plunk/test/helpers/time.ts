import { vi } from 'vitest';
import dayjs from 'dayjs';

/**
 * Time control helper for testing time-dependent functionality
 * Provides utilities to freeze time, advance time, and control dayjs
 */
export class TimeControl {
  private currentTime: Date | null = null;

  /**
   * Freeze time at a specific date
   * @param date Date to freeze at (defaults to 2025-01-01 12:00:00 UTC)
   */
  freeze(date?: Date | string) {
    const freezeDate = date ? new Date(date) : new Date('2025-01-01T12:00:00.000Z');
    this.currentTime = freezeDate;

    vi.useFakeTimers();
    vi.setSystemTime(freezeDate);

    return freezeDate;
  }

  /**
   * Advance time by specified duration
   * @param ms Milliseconds to advance
   */
  advance(ms: number) {
    if (!this.currentTime) {
      throw new Error('Time not frozen. Call freeze() first.');
    }

    vi.advanceTimersByTime(ms);
    this.currentTime = new Date(this.currentTime.getTime() + ms);

    return this.currentTime;
  }

  /**
   * Advance time to a specific date
   * @param date Target date
   */
  advanceTo(date: Date | string) {
    const targetDate = new Date(date);

    if (!this.currentTime) {
      throw new Error('Time not frozen. Call freeze() first.');
    }

    const diff = targetDate.getTime() - this.currentTime.getTime();
    if (diff < 0) {
      throw new Error('Cannot advance to a date in the past');
    }

    return this.advance(diff);
  }

  /**
   * Get current frozen time
   */
  now(): Date {
    if (!this.currentTime) {
      throw new Error('Time not frozen. Call freeze() first.');
    }
    return this.currentTime;
  }

  /**
   * Restore real time
   */
  restore() {
    vi.useRealTimers();
    this.currentTime = null;
  }

  /**
   * Helper methods for common time operations
   */
  helpers = {
    /** Advance time by seconds */
    advanceSeconds: (seconds: number) => this.advance(seconds * 1000),

    /** Advance time by minutes */
    advanceMinutes: (minutes: number) => this.advance(minutes * 60 * 1000),

    /** Advance time by hours */
    advanceHours: (hours: number) => this.advance(hours * 60 * 60 * 1000),

    /** Advance time by days */
    advanceDays: (days: number) => this.advance(days * 24 * 60 * 60 * 1000),

    /** Get a date relative to frozen time */
    relative: (amount: number, unit: 'second' | 'minute' | 'hour' | 'day') => {
      if (!this.currentTime) {
        throw new Error('Time not frozen. Call freeze() first.');
      }
      return dayjs(this.currentTime).add(amount, unit).toDate();
    },
  };
}

/**
 * Create a new TimeControl instance for a test
 */
export function createTimeControl() {
  return new TimeControl();
}

/**
 * Helper to run a test with frozen time
 */
export async function withFrozenTime<T>(
  date: Date | string,
  fn: (timeControl: TimeControl) => T | Promise<T>
): Promise<T> {
  const timeControl = new TimeControl();
  timeControl.freeze(date);

  try {
    return await fn(timeControl);
  } finally {
    timeControl.restore();
  }
}
