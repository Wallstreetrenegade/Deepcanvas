/**
 * Shared date formatting and manipulation utilities
 */

import dayjs from 'dayjs';

/**
 * Get the user's timezone
 */
export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Format a Date to datetime-local input format (YYYY-MM-DDTHH:mm)
 */
export function formatDateTimeLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Schedule presets for quick date/time selection
 */
export const schedulePresets = {
  /**
   * In 1 hour from now
   */
  inOneHour: (): string => {
    const date = new Date();
    date.setHours(date.getHours() + 1);
    return formatDateTimeLocal(date);
  },

  /**
   * In 3 hours from now
   */
  inThreeHours: (): string => {
    const date = new Date();
    date.setHours(date.getHours() + 3);
    return formatDateTimeLocal(date);
  },

  /**
   * Tomorrow at 9 AM
   */
  tomorrowAt9AM: (): string => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return formatDateTimeLocal(date);
  },

  /**
   * Tomorrow at 2 PM
   */
  tomorrowAt2PM: (): string => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(14, 0, 0, 0);
    return formatDateTimeLocal(date);
  },

  /**
   * Next Monday at 9 AM
   */
  nextMonday: (): string => {
    const date = new Date();
    const dayOfWeek = date.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    date.setDate(date.getDate() + daysUntilMonday);
    date.setHours(9, 0, 0, 0);
    return formatDateTimeLocal(date);
  },

  /**
   * In 1 week at 9 AM
   */
  inOneWeek: (): string => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    date.setHours(9, 0, 0, 0);
    return formatDateTimeLocal(date);
  },
};

/**
 * Format a date for display (full date and time)
 */
export function formatFullDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

/**
 * Format a date for display in UTC
 */
export function formatUTCDateTime(date: Date): string {
  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Format a date as relative time with short format for very recent updates
 * Returns "just now" for updates within the last minute to avoid text wrapping
 */
export function formatRelativeTime(date: Date | string): string {
  const now = dayjs();
  const then = dayjs(date);
  const secondsAgo = now.diff(then, 'second');

  // If less than 60 seconds, show "just now"
  if (secondsAgo < 60) {
    return 'just now';
  }

  // Otherwise use standard relative time
  return then.fromNow();
}
