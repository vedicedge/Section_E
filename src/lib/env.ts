import 'server-only';

const isProd = process.env.NODE_ENV === 'production';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

let warnedSecret = false;

export const env = {
  isProd,
  databaseUrl: process.env.DATABASE_URL || null,
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

  adminPassword: process.env.ADMIN_PASSWORD || null,
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || null,
};
