import { useEffect } from 'react';

export function useTabDetection({ onSwitch, active }) {
  useEffect(() => {
    if (!active) return;

    const handleVisibility = () => {
      if (document.hidden) {
        onSwitch?.({
          type: 'tab_switch',
          severity: 'danger',
          message: 'Candidate switched to another tab/window',
          metadata: { timestamp: new Date().toISOString() }
        });
      }
    };

    const handleBlur = () => {
      if (active) {
        onSwitch?.({
          type: 'tab_switch',
          severity: 'warning',
          message: 'Browser window lost focus',
          metadata: { timestamp: new Date().toISOString() }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
    };
  }, [active, onSwitch]);
}