import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// A throwaway embedded database, so these tests never touch the dev or e2e data.
const dir = mkdtempSync(path.join(tmpdir(), 'se-budgets-'));
vi.stubEnv('PGLITE_DIR', dir);
vi.stubEnv('DATABASE_URL', '');
vi.stubEnv('POSTGRES_URL', '');

type RateLimit = typeof import('@/lib/rate-limit');
type Budgets = typeof import('@/lib/login-budgets');
type Db = typeof import('@/lib/db');
let rl: RateLimit;
let budgets: Budgets;
let db: Db;

beforeAll(async () => {
  rl = await import('@/lib/rate-limit');
  budgets = await import('@/lib/login-budgets');
  db = await import('@/lib/db');
}, 60_000);

afterAll(() => {
  vi.unstubAllEnvs();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // PGlite may still hold the folder open on Windows; the OS temp cleaner will get it.
  }
});

const tiny = (key: string) => [{ key, limit: 3, windowSeconds: 60 }];

describe('failure budgets', () => {
  it('checking the budget never uses it up', async () => {
    for (let i = 0; i < 10; i++) await rl.assertWithinBudget(tiny('t:check-only'), 'Too many');
  });

  it('blocks once the failures reach the limit, with a 429', async () => {
    const b = tiny('t:block');
    await rl.recordFailure(b);
    await rl.recordFailure(b);
    await rl.assertWithinBudget(b, 'Too many');
    await rl.recordFailure(b);
    await expect(rl.assertWithinBudget(b, 'Too many')).rejects.toMatchObject({ status: 429, code: 'rate_limited' });
  });

  it('counts each account separately', async () => {
    const a = tiny('t:account-a');
    for (let i = 0; i < 3; i++) await rl.recordFailure(a);
    await expect(rl.assertWithinBudget(a, 'Too many')).rejects.toMatchObject({ status: 429 });
    await rl.assertWithinBudget(tiny('t:account-b'), 'Too many');
  });

  it('ignores a window that has ended', async () => {
    await db.query(
      `INSERT INTO rate_limits (key, count, reset_at) VALUES ('t:expired', 99, now() - interval '1 minute')`,
    );
    await rl.assertWithinBudget(tiny('t:expired'), 'Too many');
  });

  it('reset clears a roll number’s daily PIN budget', async () => {
    const b = budgets.pinFailureBudgets('26PGDM999');
    for (let i = 0; i < budgets.PIN_DAILY_LIMIT; i++) await rl.recordFailure(b);
    await expect(rl.assertWithinBudget(b, 'Too many')).rejects.toMatchObject({ status: 429 });
    await rl.reset(b[0]!.key);
    await rl.assertWithinBudget(b, 'Too many');
  });

  it('admin budgets are shared across addresses and include a daily cap', () => {
    expect(budgets.ADMIN_FAILURE_BUDGETS.map((b) => b.key)).toEqual(['admin-login-fail:15m', 'admin-login-fail:day']);
    expect(budgets.ADMIN_FAILURE_BUDGETS.every((b) => !b.key.includes(':ip'))).toBe(true);
  });
});
