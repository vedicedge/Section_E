/* Section E service worker — homework reminders only. No fetch handler, no caching. */

const DEFAULT_URL = '/homework';
const ICON = '/icons/icon-192.png';
const BADGE = '/icons/badge-72.png';

/** Same-origin relative paths only ("/homework"); anything else falls back to the homework page. */
function safePath(raw) {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_URL;
  try {
    const url = new URL(raw, self.location.origin);
    return url.origin === self.location.origin ? url.pathname + url.search + url.hash : DEFAULT_URL;
  } catch {
    return DEFAULT_URL;
  }
}

function readPayload(event) {
  if (!event.data) return {};
  try {
    const data = event.data.json();
    return data && typeof data === 'object' ? data : {};
  } catch {
    try {
      return { body: event.data.text() };
    } catch {
      return {};
    }
  }
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const data = readPayload(event);
  const title = typeof data.title === 'string' && data.title.trim() ? data.title : 'Section E';
  const body = typeof data.body === 'string' ? data.body : '';
  const tag = typeof data.tag === 'string' && data.tag ? data.tag : undefined;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: ICON,
      badge: BADGE,
      tag,
      renotify: Boolean(tag),
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(safePath(event.notification.data && event.notification.data.url), self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const sameOrigin = windows.filter((c) => {
        try {
          return new URL(c.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });
      const client = sameOrigin.find((c) => c.url === target) || sameOrigin.find((c) => c.focused) || sameOrigin[0];
      if (client) {
        try {
          const focused = (await client.focus()) || client;
          if (focused.url !== target && 'navigate' in focused) await focused.navigate(target);
          return;
        } catch {
          // An uncontrolled tab can't be navigated from here — open a fresh one instead.
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

/* Some browsers (notably Firefox) rotate subscriptions; re-register the new one for this student. */
self.addEventListener('pushsubscriptionchange', (event) => {
  const key = event.oldSubscription && event.oldSubscription.options && event.oldSubscription.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((sub) =>
        fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ subscription: sub.toJSON() }),
        }),
      )
      .catch(() => {}),
  );
});
