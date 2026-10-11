import 'server-only';
import { queryOne, query } from './db';
import { HttpError } from './http';

/** Fixed-window counter stored in Postgres, so limits hold across serverless instances. */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; retryAfter: number }> {
  const row = await queryOne<{ count: number; reset_at: Date }>(
    `INSERT INTO rate_limits (key, count, reset_at)
     VALUES ($1, 1, now() + make_interval(secs => $2))
     ON CONFLICT (key) DO UPDATE SET
       count    = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.count + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + make_interval(secs => $2) ELSE rate_limits.reset_at END
     RETURNING count, reset_at`,
    [key, windowSeconds],
  );
  if (Math.random() < 0.02) await query('DELETE FROM rate_limits WHERE reset_at < now()');
  const count = Number(row?.count ?? 0);
  const retryAfter = row ? Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000)) : windowSeconds;
  return { ok: count <= limit, retryAfter };
}

export async function enforce(key: string, limit: number, windowSeconds: number, message = 'Too many attempts. Please wait a bit and try again.') {
  const res = await hit(key, limit, windowSeconds);
  if (!res.ok) {
    const minutes = Math.ceil(res.retryAfter / 60);
    throw new HttpError(429, `${message} (try again in ~${minutes} min)`, 'rate_limited', { retryAfter: res.retryAfter });
  }
}

export async function reset(key: string) {
  await query('DELETE FROM rate_limits WHERE key = $1', [key]);
}
