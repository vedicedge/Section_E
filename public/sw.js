/*
 * Section E service worker: notifications (homework reminders and announcements) and offline mode.
 *
 * Offline mode keeps the last copy of the student pages you opened, so your seat, the timetable and
 * your homework still open without a connection:
 *   - pages (/, /seat, /timetable, /homework, …): network first, the saved copy only when offline;
 *   - /_next/static and /fonts: cache first (their file names change when they change);
 *   - nothing else is touched: /api, /admin, sign-in and test attempts always go to the network.
 * Signing out deletes every saved copy (the page posts 'clear-offline').
 */

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

const PAGES = 'se-pages-v1';
const STATIC = 'se-static-v1';
const KEEP = [PAGES, STATIC];
const STATIC_LIMIT = 200;
/** Wait this long for the network before showing the saved copy (very slow connections). */
const NETWORK_TIMEOUT_MS = 8000;

/** Student pages worth keeping for offline use. Admin, sign-in, test attempts and results are not. */
const OFFLINE_PAGES = [/^\/$/, /^\/seat$/, /^\/timetable$/, /^\/homework$/, /^\/attendance$/, /^\/groups$/, /^\/study$/, /^\/announcements$/, /^\/tests$/, /^\/tests\/mistakes$/];
const STATIC_PATHS = [/^\/_next\/static\//, /^\/fonts\//];

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · Section E</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#110c0a;color:#f3ece2;font:17px/1.5 system-ui,-apple-system,sans-serif;padding:24px;box-sizing:border-box}main{max-width:32ch;text-align:center}h1{font-size:28px;margin:0 0 8px}a{color:#ff6a3d}</style></head>
<body><main><h1>You’re offline</h1><p>This page hasn’t been saved on this device yet. Pages you open while online (your seat, the timetable, homework) stay available offline.</p><p><a href="/">Try the home page</a></p></main></body></html>`;

function isOfflinePage(url) {
  return url.origin === self.location.origin && OFFLINE_PAGES.some((re) => re.test(url.pathname));
}

function isStatic(url) {
  return url.origin === self.location.origin && STATIC_PATHS.some((re) => re.test(url.pathname));
}

async function trim(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
}

/**
 * The saved copy, with a notice that this is what it is. The notice is a CSS rule added to <head>
 * (drawn with html::after): it shows even before (or without) the page's scripts, and React leaves
 * it alone when it takes over the page. The page removes it once the connection is back.
 */
async function markSaved(saved, reason) {
  try {
    const html = await saved.clone().text();
    const note =
      reason === 'slow'
        ? 'The connection is very slow, so this is the copy saved on this device. It may be out of date.'
        : 'You’re offline. This is the copy saved on this device, so it may be out of date.';
    const style = `<style id="se-offline-copy">html::after{content:"${note}";position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:60;width:max-content;max-width:calc(100vw - 32px);box-sizing:border-box;padding:10px 16px;border-radius:999px;background:#f3ece2;color:#110c0a;font:14px/1.4 system-ui,-apple-system,sans-serif;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.35);pointer-events:none}</style>`;
    const marked = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + style) : style + html;
    const headers = new Headers(saved.headers);
    headers.delete('Content-Length');
    return new Response(marked, { status: 200, headers });
  } catch {
    return saved;
  }
}

/** Network first; on failure (or a very slow network) the saved copy; else a small offline page. */
async function page(request) {
  const cache = await caches.open(PAGES);
  // One copy per page, whatever the query string (?next=…, ?from=…).
  const key = new URL(request.url);
  key.search = '';
  const network = fetch(request).then(async (res) => {
    if (res.ok && res.type === 'basic' && !res.redirected) await cache.put(key.href, res.clone());
    return res;
  });
  // If the saved copy wins the race, a later network failure must not surface as an unhandled error.
  network.catch(() => {});
  const saved = await cache.match(key.href);
  try {
    if (!saved) return await network;
    let timer;
    const slow = new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS);
    });
    const res = await Promise.race([network, slow]);
    clearTimeout(timer);
    return res || markSaved(saved, 'slow');
  } catch {
    if (saved) return markSaved(saved, 'offline');
    return new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
  }
}

/** Cache first for build files, fonts and icons, which never change under the same name. */
async function asset(request) {
  const cache = await caches.open(STATIC);
  const saved = await cache.match(request);
  if (saved) return saved;
  const res = await fetch(request);
  // Only files the server marks immutable (production build files, versioned fonts). In development
  // Next serves changing files under the same names with no-store, and those must never be kept.
  if (res.ok && res.type === 'basic' && /immutable/.test(res.headers.get('Cache-Control') || '')) {
    await cache.put(request, res.clone());
    trim(STATIC, STATIC_LIMIT).catch(() => {});
  }
  return res;
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) if (name.startsWith('se-') && !KEEP.includes(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (request.mode === 'navigate') {
    if (isOfflinePage(url)) event.respondWith(page(request));
    return;
  }
  if (isStatic(url)) event.respondWith(asset(request));
});

/* Sign-out (or a different student signing in): forget every saved page. */
self.addEventListener('message', (event) => {
  if (event.origin && event.origin !== self.location.origin) return;
  if (event.data && event.data.type === 'clear-offline') {
    event.waitUntil(caches.delete(PAGES));
  }
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
