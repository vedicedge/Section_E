'use client';

import { useEffect, useState } from 'react';
import styles from './Board.module.css';

/** The CSS notice the service worker (public/sw.js) adds to a saved page it serves while offline. */
const SAVED_COPY_NOTE = 'se-offline-copy';

/**
 * Registers the service worker for every visitor (it keeps the student pages for offline use and
 * carries notifications) and shows a small notice while the device is offline.
 */
export function OfflineSupport() {
  const [offline, setOffline] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && window.isSecureContext) {
      // Same script and scope as the reminders switch, so both share one registration.
      navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
    }
    const update = () => {
      const isOffline = !navigator.onLine;
      const note = document.getElementById(SAVED_COPY_NOTE);
      // Back online: the saved-copy notice no longer applies.
      if (note && !isOffline) note.remove();
      setSavedNote(Boolean(note) && isOffline);
      setOffline(isOffline);
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;
  return (
    <p className={savedNote ? 'sr-only' : styles.offline} role="status" data-testid="offline-banner">
      {savedNote
        ? 'You’re offline. This is the copy saved on this device, so it may be out of date.'
        : 'You’re offline. Pages you opened before still work; new ones need a connection.'}
    </p>
  );
}
