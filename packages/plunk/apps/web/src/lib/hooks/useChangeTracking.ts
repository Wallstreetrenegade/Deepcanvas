import {useBeforeUnload} from '@plunk/ui';
import {useRouter} from 'next/router';
import {useEffect} from 'react';

/**
 * Custom hook to handle unsaved changes warning
 * Warns user before navigating away (browser or Next.js navigation) when there are unsaved changes
 */
export function useChangeTracking(hasChanges: boolean, enabled: boolean = true) {
  const router = useRouter();

  // Warn before leaving page with unsaved changes (browser navigation)
  useBeforeUnload(enabled && hasChanges);

  // Warn before Next.js route changes
  useEffect(() => {
    if (!enabled || !hasChanges) return;

    const handleRouteChange = (url: string) => {
      // Only show confirmation if navigating to a different page
      if (router.asPath !== url) {
        const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
        if (!confirmed) {
          router.events.emit('routeChangeError');
          throw 'Route change aborted by user';
        }
      }
    };

    router.events.on('routeChangeStart', handleRouteChange);

    return () => {
      router.events.off('routeChangeStart', handleRouteChange);
    };
  }, [hasChanges, enabled, router]);
}
