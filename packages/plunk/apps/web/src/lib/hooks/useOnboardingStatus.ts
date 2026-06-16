import {useMemo} from 'react';

import {useActiveProject} from '../contexts/ActiveProjectProvider';
import {useDashboardStats} from './useDashboardStats';
import {useOnboardingComplete} from './useOnboardingComplete';

export type OnboardingStatus = 'loading' | 'show' | 'skip';

/**
 * Read-only onboarding status. "skip" means the user is already onboarded —
 * either they dismissed/finished explicitly, or their project has already
 * sent at least one email.
 */
export function useOnboardingStatus(): OnboardingStatus {
  const {activeProject} = useActiveProject();
  const {isComplete} = useOnboardingComplete(activeProject?.id);
  const {totalEmailsSent, isLoading} = useDashboardStats();

  return useMemo<OnboardingStatus>(() => {
    if (isComplete === true) return 'skip';
    if (isComplete === null) return 'loading';
    if (isLoading) return 'loading';
    if (totalEmailsSent > 0) return 'skip';
    return 'show';
  }, [isComplete, isLoading, totalEmailsSent]);
}
