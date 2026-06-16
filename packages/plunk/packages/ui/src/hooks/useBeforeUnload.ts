import {useEffect} from 'react';

/**
 * Hook that warns users before they leave the page with unsaved changes
 * Works with both browser navigation (tab close, back button) and Next.js routing
 * @param enabled - Whether to show the warning (typically when hasChanges is true)
 * @param message - Optional custom message (note: most browsers ignore custom messages)
 */
export function useBeforeUnload(enabled: boolean, message?: string): void {
  useEffect(() => {
    if (!enabled) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Cancel the event to show the browser's confirmation dialog
      e.preventDefault();
      // Chrome requires returnValue to be set (modern browsers show their own message)
      e.returnValue = '';
      // Some older browsers use the return value
      return '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled]);
}
