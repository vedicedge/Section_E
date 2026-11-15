'use client';

import { useEffect } from 'react';

/** Counts the announcements on screen as seen, once the page has actually loaded in the browser. */
export function MarkSeen({ ids }: { ids: string[] }) {
  const key = ids.join(',');
  useEffect(() => {
    if (!key) return;
    fetch('/api/announcements/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: key.split(',') }),
    }).catch(() => undefined);
  }, [key]);
  return null;
}
