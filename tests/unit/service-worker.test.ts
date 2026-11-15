import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Runs public/sw.js in a sandbox with a fake Cache Storage and a fake network, then dispatches
 * fetch events the way a browser would.
 */
const SOURCE = readFileSync(join(import.meta.dirname, '..', '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://section-e.example';

type Listener = (event: unknown) => void;

function setup(network: (req: Request) => Promise<Response>) {
  const stores = new Map<string, Map<string, Response>>();
  const keyOf = (r: Request | string) => (typeof r === 'string' ? r : r.url);
  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      match: async (r: Request | string) => store.get(keyOf(r))?.clone(),
      put: async (r: Request | string, res: Response) => void store.set(keyOf(r), res),
      keys: async () => [...store.keys()].map((u) => new Request(u)),
      delete: async (r: Request | string) => store.delete(keyOf(r)),
    };
  };
  const caches = {
    open,
    match: async (r: Request | string) => {
      for (const s of stores.values()) if (s.has(keyOf(r))) return s.get(keyOf(r))!.clone();
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
  };
  const listeners = new Map<string, Listener[]>();
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, fn: Listener) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    skipWaiting: () => undefined,
    clients: { claim: async () => undefined },
    registration: {},
  };
  runInNewContext(SOURCE, { self, caches, fetch: network, Response, Request, Headers, URL, setTimeout, clearTimeout, Promise, console });

  async function dispatch(url: string, mode: RequestMode = 'navigate'): Promise<Response | undefined> {
    const request = new Request(new URL(url, ORIGIN).href);
    Object.defineProperty(request, 'mode', { value: mode });
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    for (const fn of listeners.get('fetch') ?? []) fn({ request, respondWith: (p: Promise<Response>) => (responded = p), waitUntil: (p: Promise<unknown>) => waits.push(p) });
    const res = responded ? await responded : undefined;
    await Promise.all(waits);
    return res;
  }
  function message(data: unknown) {
    const waits: Promise<unknown>[] = [];
    for (const fn of listeners.get('message') ?? []) fn({ data, origin: ORIGIN, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    return Promise.all(waits);
  }
  return { dispatch, message, stores };
}

const page = (body: string) => new Response(`<!doctype html><html><head><title>x</title></head><body>${body}</body></html>`, { status: 200, headers: { 'Content-Type': 'text/html' } });

describe('service worker offline mode', () => {
  let online = true;
  let served = 0;
  const network = async (req: Request) => {
    if (!online) throw new TypeError('Failed to fetch');
    served++;
    const path = new URL(req.url).pathname;
    if (path.startsWith('/_next/static/')) return new Response('js', { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } });
    if (path === '/_next/static-dev') return new Response('dev', { headers: { 'Cache-Control': 'no-store' } });
    return page(`<h1>${path} v${served}</h1>`);
  };
  // fetch() results are "basic" for same-origin requests in a browser; Node's Response says "default".
  const sameOrigin = async (req: Request) => {
    const res = await network(req);
    Object.defineProperty(res, 'type', { value: 'basic' });
    return res;
  };

  beforeEach(() => {
    online = true;
    served = 0;
  });

  it('saves student pages while online and serves the saved copy, marked, when offline', async () => {
    const sw = setup(sameOrigin);
    const fresh = await sw.dispatch('/seat?from=menu');
    expect(await fresh!.text()).toContain('/seat v1');
    online = false;
    const offline = await sw.dispatch('/seat');
    const html = await offline!.text();
    expect(html).toContain('/seat v1');
    expect(html).toMatch(/<head><style id="se-offline-copy">html::after\{content:"You’re offline/);
  });

  it('shows a small offline page for a page never opened', async () => {
    const sw = setup(sameOrigin);
    online = false;
    const res = await sw.dispatch('/homework');
    expect(res!.status).toBe(503);
    expect(await res!.text()).toContain('You’re offline');
  });

  it('never handles admin, API, sign-in or test-attempt pages', async () => {
    const sw = setup(sameOrigin);
    for (const url of ['/admin', '/api/health', '/register', '/tests/attempt/abc', '/tests/result/abc']) {
      expect(await sw.dispatch(url)).toBeUndefined();
    }
  });

  it('keeps only immutable build files, cache first', async () => {
    const sw = setup(sameOrigin);
    await sw.dispatch('/_next/static/chunks/a.js', 'no-cors');
    online = false;
    expect(await (await sw.dispatch('/_next/static/chunks/a.js', 'no-cors'))!.text()).toBe('js');
    expect(sw.stores.get('se-static-v1')!.size).toBe(1);
  });

  it('deletes every saved page when told to (sign-out)', async () => {
    const sw = setup(sameOrigin);
    await sw.dispatch('/seat');
    expect(sw.stores.get('se-pages-v1')!.size).toBe(1);
    await sw.message({ type: 'clear-offline' });
    expect(sw.stores.has('se-pages-v1')).toBe(false);
  });
});
