/** Small fetch wrapper for client components: JSON in, `{ ok, data } | { ok: false, error }` out. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; code: string; status: number };

export async function api<T>(url: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: json?.error?.code ?? 'error',
        error: json?.error?.message ?? `Request failed (${res.status}).`,
      };
    }
    return { ok: true, data: json as T };
  } catch {
    return { ok: false, status: 0, code: 'network', error: 'You seem to be offline. Check your connection and try again.' };
  }
}
