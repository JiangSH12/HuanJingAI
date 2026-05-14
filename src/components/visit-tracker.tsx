'use client';

import { useEffect, useRef } from 'react';

/**
 * Tracks site visits by calling /api/site-stats on page load.
 * Uses sessionStorage to count only once per browser session.
 */
export function VisitTracker() {
  const tracked = useRef(false);

  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;

    // Only track once per session
    if (typeof window !== 'undefined' && sessionStorage.getItem('visit_tracked')) {
      return;
    }

    fetch('/api/site-stats', { method: 'POST' })
      .then(() => {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('visit_tracked', '1');
        }
      })
      .catch(() => { /* non-critical */ });
  }, []);

  return null;
}
