import useSWR from 'swr';
import type {ProjectSecurityMetrics} from '@plunk/types';

export interface ProjectSecurityResponse {
  success: boolean;
  data: ProjectSecurityMetrics;
}

/**
 * Hook to fetch project security metrics
 * Auto-refreshes every 2 minutes to keep data current
 */
export function useProjectSecurity(projectId: string | undefined) {
  const {data, error, isLoading, mutate} = useSWR<ProjectSecurityResponse>(
    projectId ? `/projects/${projectId}/security` : null,
    {
      refreshInterval: 120000, // 2 minutes
      revalidateOnFocus: false,
    },
  );

  return {
    securityMetrics: data?.data,
    isLoading,
    error,
    mutate,
  };
}
