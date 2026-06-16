import {useCallback, useSyncExternalStore} from 'react';

export type OnboardingPath = 'developer' | 'marketing' | 'workflows';

const storageKey = (projectId: string) => `plunk-onboarding-path-${projectId}`;
const CHANGE_EVENT = 'plunk:onboarding-path-changed';

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('storage', callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function isPath(value: string | null): value is OnboardingPath {
  return value === 'developer' || value === 'marketing' || value === 'workflows';
}

/**
 * Per-project record of the onboarding path the user chose.
 * Drives the persistent onboarding banner so navigation doesn't lose the thread.
 */
export function useOnboardingPath(projectId: string | undefined) {
  const getSnapshot = useCallback(() => {
    if (!projectId || typeof window === 'undefined') return null;
    const value = localStorage.getItem(storageKey(projectId));
    return isPath(value) ? value : null;
  }, [projectId]);

  const path = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const setPath = useCallback(
    (next: OnboardingPath) => {
      if (!projectId || typeof window === 'undefined') return;
      localStorage.setItem(storageKey(projectId), next);
      window.dispatchEvent(new Event(CHANGE_EVENT));
    },
    [projectId],
  );

  const clearPath = useCallback(() => {
    if (!projectId || typeof window === 'undefined') return;
    localStorage.removeItem(storageKey(projectId));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [projectId]);

  return {path, setPath, clearPath};
}
