'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { api } from '@/lib/client-api';
import styles from './ReminderToggle.module.css';

type State = 'checking' | 'unconfigured' | 'ios' | 'unsupported' | 'denied' | 'off' | 'on';

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';
/** Which student this browser's subscription was last saved for, so a shared device re-binds once. */
const OWNER_KEY = 'se.reminders.owner';
/** Re-save the subscription at most daily, so one the server pruned (or lost) comes back on its own. */
const RESYNC_MS = 24 * 60 * 60 * 1000;

interface Owner {
  endpoint: string;
  roll: string;
  at: number;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = window.atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** False when the subscription was made with an older server key (pushes to it would be rejected). */
function sameKey(existing: ArrayBuffer | null | undefined, key: Uint8Array): boolean {
  if (!existing) return true;
  const a = new Uint8Array(existing);
  return a.length === key.length && a.every((v, i) => v === key[i]);
}

function pushSupported(): boolean {
  // Firefox private windows and insecure origins expose the property but leave it undefined.
  return Boolean(navigator.serviceWorker) && 'PushManager' in window && 'Notification' in window;
}

function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function askPermission(): Promise<NotificationPermission> {
  return new Promise((resolve) => {
    // Older Safari only supports the callback form.
    const result = Notification.requestPermission(resolve);
    if (result) result.then(resolve, () => resolve(Notification.permission));
  });
}

function readOwner(): Owner | null {
  try {
    const value = JSON.parse(localStorage.getItem(OWNER_KEY) ?? 'null');
    if (!value || typeof value.endpoint !== 'string' || typeof value.roll !== 'string') return null;
    return { endpoint: value.endpoint, roll: value.roll, at: typeof value.at === 'number' ? value.at : 0 };
  } catch {
    return null;
  }
}

function writeOwner(value: Omit<Owner, 'at'> | null) {
  try {
    if (value) localStorage.setItem(OWNER_KEY, JSON.stringify({ ...value, at: Date.now() }));
    else localStorage.removeItem(OWNER_KEY);
  } catch {
    // Storage blocked (private mode): the server still has the subscription.
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export function ReminderToggle({ rollNo, configured = true }: { rollNo: string; configured?: boolean }) {
  const enabled = configured && Boolean(VAPID_KEY);
  const [state, setState] = useState<State>(enabled ? 'checking' : 'unconfigured');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ios, setIos] = useState(false);
  const titleId = useId();

  // Look up this device's existing subscription without ever prompting.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      const iosDevice = isIOS();
      setIos(iosDevice);
      if (!pushSupported()) return setState(iosDevice && !isStandalone() ? 'ios' : 'unsupported');
      if (Notification.permission === 'denied') return setState('denied');
      try {
        const sub = await currentSubscription();
        if (cancelled) return;
        if (!sub || Notification.permission !== 'granted' || !sameKey(sub.options?.applicationServerKey, urlBase64ToUint8Array(VAPID_KEY))) {
          return setState('off');
        }
        setState('on');
        const owner = readOwner();
        if (!owner || owner.endpoint !== sub.endpoint || owner.roll !== rollNo || Date.now() - owner.at > RESYNC_MS) {
          const res = await api('/api/push/subscribe', { subscription: sub.toJSON() });
          if (res.ok) writeOwner({ endpoint: sub.endpoint, roll: rollNo });
        }
      } catch {
        if (!cancelled) setState('off');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, rollNo]);

  async function turnOn() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      // Ask first, synchronously inside the click: Safari drops the prompt after an await.
      const permission = askPermission();
      const registering = navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
      // Awaited below; this only keeps an early return from leaving the rejection unhandled.
      registering.catch(() => undefined);
      const answer = await permission;
      if (answer === 'denied') return setState('denied');
      if (answer !== 'granted') return setMessage('Notifications weren’t allowed. Tap the button again whenever you’re ready.');
      await registering;
      const reg = await navigator.serviceWorker.ready;
      const key = urlBase64ToUint8Array(VAPID_KEY);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options?.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const res = await api('/api/push/subscribe', { subscription: sub.toJSON() });
      if (!res.ok) return setError(res.error);
      writeOwner({ endpoint: sub.endpoint, roll: rollNo });
      setState('on');
    } catch {
      if ('Notification' in window && Notification.permission === 'denied') setState('denied');
      else setError('This browser couldn’t set up notifications. Please try again in a moment.');
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const sub = await currentSubscription();
      if (sub) {
        const res = await api('/api/push/unsubscribe', { endpoint: sub.endpoint });
        // Offline: keep it on rather than claim "off". Other failures are fine — once the browser
        // drops the subscription, the server prunes the dead endpoint on its next send.
        if (!res.ok && res.status === 0) return setError(res.error);
        await sub.unsubscribe().catch(() => false);
      }
      writeOwner(null);
      setState('off');
      setMessage('Reminders are off for this device.');
    } catch {
      setError('Couldn’t turn reminders off. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  let status: ReactNode = null;
  if (state === 'checking') status = 'Checking this device…';
  else if (state === 'unconfigured') status = 'Reminders aren’t switched on for the section yet.';
  else if (state === 'unsupported') status = 'This browser can’t show notifications.';
  else if (state === 'denied')
    status = ios
      ? 'Notifications are blocked for Section E. Allow them in Settings → Notifications → Section E, then reopen the app.'
      : 'Notifications are blocked for this site. Allow them in your browser’s site settings (the icon beside the address bar), then reload this page.';
  else if (state === 'on') status = 'Reminders on for this device — expect a nudge the evening before anything is due.';
  else if (state === 'ios') status = 'On iPhone and iPad, reminders work once Section E is on your home screen:';

  return (
    <section className={styles.card} aria-labelledby={titleId} data-state={state}>
      <Bell className={styles.art} />
      <div className={styles.body}>
        <div className={styles.top}>
          <h2 id={titleId} className={styles.title}>
            Reminders
          </h2>
          {state === 'on' && (
            <span className="pill pill--ok">
              <span className="dot" aria-hidden /> On
            </span>
          )}
          {(state === 'off' || state === 'denied') && <span className="pill pill--muted">Off</span>}
        </div>
        <p className={styles.copy}>Get a reminder the evening before homework is due — on this device.</p>
        <p className={styles.status} role="status" aria-live="polite">
          {message ?? status}
        </p>
        {state === 'ios' && (
          <ol className={styles.steps}>
            <li>
              <span>
                Tap <strong>Share</strong> <ShareGlyph />
              </span>
            </li>
            <li>
              <span>
                Then <strong>Add to Home Screen</strong>.
              </span>
            </li>
            <li>
              <span>Open Section E from your home screen and turn reminders on here.</span>
            </li>
          </ol>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
      {(state === 'off' || state === 'on' || state === 'checking') && (
        <div className={styles.actions}>
          {state === 'checking' && <span className={`skeleton ${styles.placeholder}`} aria-hidden />}
          {state === 'off' && (
            <button type="button" className="btn btn--accent" onClick={turnOn} disabled={busy}>
              {busy ? 'Turning on…' : 'Turn on reminders'}
            </button>
          )}
          {state === 'on' && (
            <button type="button" className="btn btn--ghost" onClick={turnOff} disabled={busy}>
              {busy ? 'Turning off…' : 'Turn off'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function Bell({ className }: { className?: string }) {
  const hatch = useId();
  return (
    <svg className={className} viewBox="0 0 48 56" fill="none" aria-hidden>
      <defs>
        <pattern id={hatch} width="2.4" height="2.4" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="2.4" stroke="currentColor" strokeWidth="0.6" />
        </pattern>
      </defs>
      <g stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round">
        <circle cx="24" cy="5" r="2.6" />
        <path d="M24 7.6 C14.5 8.5 10 15.5 10 24 V34 L5 41 H43 L38 34 V24 C38 15.5 33.5 8.5 24 7.6 Z" />
        <path d="M30 12.5 C34 15 35 20 35 24 V35 L38.5 40 H28 C31 33 31.5 21 30 12.5 Z" fill={`url(#${hatch})`} stroke="none" />
        <path d="M5 41 H43" strokeWidth="1.6" />
        <path d="M19 45 C19.5 48.5 21.5 50.5 24 50.5 C26.5 50.5 28.5 48.5 29 45" />
        <path d="M14 26 C14 19 17 14 21 12.5" strokeWidth="0.8" />
      </g>
    </svg>
  );
}

function ShareGlyph() {
  return (
    <svg className={styles.share} viewBox="0 0 20 24" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 2 V14 M6 6 L10 2 L14 6" />
        <path d="M7 9.5 H4.5 V21.5 H15.5 V9.5 H13" />
      </g>
    </svg>
  );
}
