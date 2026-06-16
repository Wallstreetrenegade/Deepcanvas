import useSWR from 'swr';

/**
 *
 */
export function useStats() {
  return useSWR<{
    emails: number;
    events: number;
    projects: number;
    contacts: number;
  }>('/utils', {
    shouldRetryOnError: false,
  });
}
