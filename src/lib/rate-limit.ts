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

/**
 * Failure budgets: unlike `enforce`, nothing is counted here. Check the budget before trying a
 * secret, and call `recordFailure` only when the attempt was wrong, so successful sign-ins never
 * use it up. The counters are per account, not per IP, so many addresses don't buy more guesses.
 */
export interface FailureBudget {
  key: string;
  limit: number;
  windowSeconds: number;
}

export async function assertWithinBudget(budgets: FailureBudget[], message: string) {
  for (const b of budgets) {
    const row = await queryOne<{ count: number; reset_at: Date }>(
      'SELECT count, reset_at FROM rate_limits WHERE key = $1 AND reset_at > now()',
      [b.key],
    );
    if (row && Number(row.count) >= b.limit) {
      const retryAfter = Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
      const minutes = Math.ceil(retryAfter / 60);
      const wait = minutes >= 90 ? `~${Math.round(minutes / 60)} h` : `~${minutes} min`;
      throw new HttpError(429, `${message} (try again in ${wait})`, 'rate_limited', { retryAfter });
    }
  }
}

export async function recordFailure(budgets: FailureBudget[]) {
  for (const b of budgets) await hit(b.key, b.limit, b.windowSeconds);
}

export async function reset(key: string) {
  await query('DELETE FROM rate_limits WHERE key = $1', [key]);
}
