import 'server-only';
import { env } from './env';
import { MIGRATIONS } from './schema';

/**
 * Tiny database layer. Production uses Postgres (any provider: Neon, Supabase, Vercel Postgres…)
 * through `DATABASE_URL`. Without it, an embedded PGlite (Postgres compiled to WASM) stores data
 * under `.data/pglite`, so local development needs no database server.
 * Both drivers expose the same `query(text, params) → { rows }` shape, so all SQL is shared.
 */

export interface Queryable {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface Driver extends Queryable {
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: Queryable & { exec(sql: string): Promise<void> }) => Promise<T>): Promise<T>;
}

const DATE_OID = 1082;

async function createPgDriver(url: string): Promise<Driver> {
  const pg = (await import('pg')).default;
  // Keep DATE columns as 'YYYY-MM-DD' strings instead of local-midnight Date objects.
  pg.types.setTypeParser(DATE_OID, (v: string) => v);
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX || 3),
  });
  return {
    query: async (text, params) => pool.query(text, params as unknown[]) as never,
    exec: async (sql) => {
      await pool.query(sql);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn({
          query: async (text, params) => client.query(text, params as unknown[]) as never,
          exec: async (sql) => {
            await client.query(sql);
          },
        });
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

async function createPgliteDriver(dir: string): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
  const db = new PGlite(dir, { parsers: { [DATE_OID]: (v: string) => v } });
  await db.waitReady;
  return {
    query: async (text, params) => db.query(text, params) as never,
    exec: async (sql) => {
      await db.exec(sql);
    },
    transaction: async (fn) =>
      db.transaction(async (tx) =>
        fn({
          query: async (text, params) => tx.query(text, params) as never,
          exec: async (sql) => {
            await tx.exec(sql);
          },
        }),
      ),
  };
}

async function migrate(driver: Driver) {
  await driver.transaction(async (tx) => {
    // Serialise concurrent cold starts (several serverless instances may boot at once).
    await tx.query('SELECT pg_advisory_xact_lock(727274)');
    await tx.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const { rows } = await tx.query<{ version: number }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((r) => Number(r.version)));
    for (const [index, sql] of MIGRATIONS.entries()) {
      const version = index + 1;
      if (applied.has(version)) continue;
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
    }
  });
}

type GlobalWithDb = typeof globalThis & { __sectionEDb?: Promise<Driver> };
const g = globalThis as GlobalWithDb;

function getDriver(): Promise<Driver> {
  if (!g.__sectionEDb) {
    g.__sectionEDb = (async () => {
      if (!env.databaseUrl && process.env.VERCEL) {
        // Serverless file systems are read-only/ephemeral, so the embedded database can't work there.
        throw new Error('DATABASE_URL is not set. Add a Postgres database (e.g. Neon via Vercel Storage) and redeploy.');
      }
      const driver = env.databaseUrl ? await createPgDriver(env.databaseUrl) : await createPgliteDriver(env.pgliteDir);
      await migrate(driver);
      return driver;
    })().catch((err) => {
      g.__sectionEDb = undefined;
      throw err;
    });
  }
  return g.__sectionEDb;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const driver = await getDriver();
  const { rows } = await driver.query<T>(text, params);
  return rows;
}

export async function queryOne<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const driver = await getDriver();
  return driver.transaction(fn);
}

/** jsonb parameters must be passed as JSON text: node-postgres would turn JS arrays into Postgres arrays. */
export function json(value: unknown): string {
  return JSON.stringify(value);
}
