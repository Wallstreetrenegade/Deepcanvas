import type {BillingLimitsResponse, CategoryUsage} from '@plunk/types';
import useSWR from 'swr';

// Re-export for backward compatibility
export type CategoryLimit = CategoryUsage;
export type BillingLimitsData = BillingLimitsResponse;

/**
 * Hook to fetch billing limits for a project
 *
 * Free tier projects (no subscription): Shows total usage with 1000/month limit
 * Paid tier projects (with subscription): Shows per-category usage with custom limits
 */
export function useBillingLimits(projectId: string | undefined, billingEnabled: boolean) {
  const {data, error, mutate, isLoading} = useSWR<BillingLimitsResponse>(
    projectId && billingEnabled ? `/users/@me/projects/${projectId}/billing-limits` : null,
    {
      revalidateOnFocus: false,
      refreshInterval: 30000, // Refresh every 30 seconds to keep usage updated
    },
  );

  return {
    limitsData: data,
    error,
    isLoading,
    mutate,
  };
}
