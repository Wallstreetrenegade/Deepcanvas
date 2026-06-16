import {useMemo} from 'react';
import useSWR from 'swr';

export interface ActivityStats {
  totalEvents: number;
  totalEmailsSent: number;
  totalEmailsOpened: number;
  totalEmailsClicked: number;
  totalWorkflowsStarted: number;
  openRate: number;
  clickRate: number;
}

export interface TimeSeriesDataPoint {
  date: string;
  emails: number;
  opens: number;
  clicks: number;
  bounces: number;
}

export interface AnalyticsData {
  stats: ActivityStats | null;
  timeSeries: TimeSeriesDataPoint[] | null;
  isLoading: boolean;
  error: Error | undefined;
}

interface UseAnalyticsOptions {
  startDate?: string;
  endDate?: string;
  days?: number;
}

/**
 * Hook to fetch analytics data including activity stats and time series data
 */
export function useAnalytics(options: UseAnalyticsOptions = {}): AnalyticsData {
  const {days = 30} = options;

  // Calculate date range - memoized to prevent infinite re-renders
  // Only recalculate when days or explicit dates change
  /* eslint-disable react-hooks/purity */
  const {startDate, endDate} = useMemo(() => {
    const end = options.endDate || new Date().toISOString();
    const now = Date.now();
    const start = options.startDate || new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

    return {startDate: start, endDate: end};
  }, [days, options.startDate, options.endDate]);
  /* eslint-enable react-hooks/purity */

    const {
    data: stats,
    error: statsError,
    isLoading: statsLoading,
  } = useSWR<ActivityStats>(`/activity/stats?startDate=${startDate}&endDate=${endDate}`, {
    revalidateOnFocus: false,
    refreshInterval: 300000, // Refresh every 5 minutes
    dedupingInterval: 10000, // Prevent duplicate requests within 10 seconds
  });

    const {
    data: timeSeries,
    error: timeSeriesError,
    isLoading: timeSeriesLoading,
  } = useSWR<TimeSeriesDataPoint[]>(`/analytics/timeseries?startDate=${startDate}&endDate=${endDate}`, {
    revalidateOnFocus: false,
    refreshInterval: 300000, // Refresh every 5 minutes
    dedupingInterval: 10000, // Prevent duplicate requests within 10 seconds
    shouldRetryOnError: false, // Don't error out if endpoint doesn't exist yet
  });

  return {
    stats: stats || null,
    timeSeries: timeSeries || null,
    isLoading: statsLoading || timeSeriesLoading,
    error: statsError || timeSeriesError,
  };
}
