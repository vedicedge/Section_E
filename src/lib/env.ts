import 'server-only';

const isProd = process.env.NODE_ENV === 'production';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * The Postgres connection string. Vercel's database integrations name it differently depending on
 * the provider and the prefix chosen when connecting (DATABASE_URL, POSTGRES_URL, STORAGE_DATABASE_URL…).
 */
function databaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  const key = Object.keys(process.env)
    .sort()
    .find((k) => /_(DATABASE|POSTGRES)_URL$/.test(k) && process.env[k]);
  return key ? process.env[key]! : null;
}

let warnedSecret = false;

export const env = {
  isProd,
  databaseUrl: databaseUrl(),
  pgliteDir: process.env.PGLITE_DIR || '.data/pglite',

  /** Default timetable source; the admin can override it from /admin/timetable without a redeploy. */
  timetableUrl: process.env.TIMETABLE_URL || null,
  timetableSection: process.env.TIMETABLE_SECTION || 'E',
  timetableTtlSeconds: int('TIMETABLE_TTL_SECONDS', 120),
  /** Optional Google API key (Drive API v3) — gives exact "last modified" times for Drive files. */
  googleApiKey: process.env.GOOGLE_API_KEY || null,

  get sessionSecret(): string {
    const secret = process.env.SESSION_SECRET;
    if (secret && secret.length >= 32) return secret;
    if (isProd) {
      throw new Error('SESSION_SECRET must be set to a random string of at least 32 characters.');
    }
    if (!warnedSecret) {
      warnedSecret = true;
      console.warn('[section-e] SESSION_SECRET is not set — using an insecure development secret.');
    }
    return 'dev-only-insecure-session-secret-change-me-please';
  },

  /** Web Push (VAPID) keys — generate with `npx web-push generate-vapid-keys`. Without them reminders are off. */
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || null,
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  /** Shared secret for the scheduled reminder job (Vercel Cron sends it as a Bearer token). */
  cronSecret: process.env.CRON_SECRET || null,

  adminPassword: process.env.ADMIN_PASSWORD || null,
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || null,
};
