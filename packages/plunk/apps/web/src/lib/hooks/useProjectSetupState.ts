import useSWR from 'swr';

export interface ProjectSetupState {
  hasSubscription: boolean;
  hasVerifiedDomain: boolean;
  contactCount: number;
  lastCampaignSentAt: string | null;
  hasEnabledWorkflow: boolean;
}

export interface SetupStateResponse {
  success: boolean;
  data: ProjectSetupState;
}

/**
 * Hook to fetch project setup state for dashboard quick start
 */
export function useProjectSetupState(projectId: string | undefined) {
  const {data, error, isLoading} = useSWR<SetupStateResponse>(projectId ? `/projects/${projectId}/setup-state` : null);

  return {
    setupState: data?.data,
    isLoading,
    error,
  };
}
