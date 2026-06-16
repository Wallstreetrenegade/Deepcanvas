import {useCallback, useSyncExternalStore} from 'react';

const storageKey = (projectId: string) => `plunk-onboarded-${projectId}`;

function subscribe(callback: () => void) {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener('storage', callback);
  window.addEventListener('plunk:onboarding-changed', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('plunk:onboarding-changed', callback);
  };
}

/**
 * Per-project onboarding completion flag backed by localStorage.
 * `isComplete` is `null` on the server and during the first client render,
 * then resolves to `true`/`false` after hydration.
 */
export function useOnboardingComplete(projectId: string | undefined) {
  const getSnapshot = useCallback(() => {
    if (!projectId || typeof window === 'undefined') return null;
    return localStorage.getItem(storageKey(projectId)) === 'true';
  }, [projectId]);

  const isComplete = useSyncExternalStore(subscribe, getSnapshot, () => null);

  const markComplete = useCallback(() => {
    if (!projectId || typeof window === 'undefined') return;
    localStorage.setItem(storageKey(projectId), 'true');
    window.dispatchEvent(new Event('plunk:onboarding-changed'));
  }, [projectId]);

  return {isComplete, markComplete};
}
