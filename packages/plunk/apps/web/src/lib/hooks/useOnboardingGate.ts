import {useRouter} from 'next/router';
import {useEffect} from 'react';

import {useActiveProject} from '../contexts/ActiveProjectProvider';
import {useOnboardingComplete} from './useOnboardingComplete';
import {useOnboardingStatus, type OnboardingStatus} from './useOnboardingStatus';

export type OnboardingGateState = OnboardingStatus;

/**
 * Gate helper for the /onboarding pages. Redirects to the dashboard when the
 * project is already onboarded (flag set or first email sent) and persists
 * the flag so future visits short-circuit immediately.
 */
export function useOnboardingGate() {
  const router = useRouter();
  const {activeProject} = useActiveProject();
  const {isComplete, markComplete} = useOnboardingComplete(activeProject?.id);
  const state = useOnboardingStatus();

  useEffect(() => {
    if (state !== 'skip') return;
    if (!isComplete) markComplete();
    void router.replace('/');
  }, [state, isComplete, markComplete, router]);

  return {state, markComplete};
}
