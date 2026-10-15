import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Setup check for the admin: which settings are present and whether the database answers.
 * Reports names and yes/no only — never a value.
 */
export async function GET() {
  const has = (name: string) => Boolean(process.env[name]?.trim());
  const sessionSecret = process.env.SESSION_SECRET?.trim() ?? '';
  const settings = {
    database: env.databaseUrl ? 'set' : 'MISSING — Storage → Create Database → Neon, connect it to this project, then redeploy',
    SESSION_SECRET: sessionSecret.length >= 32 ? 'set' : sessionSecret ? 'TOO SHORT — needs 32+ characters' : 'MISSING',
    ADMIN_PASSWORD_HASH: has('ADMIN_PASSWORD_HASH')
      ? /^scrypt:\d+:\d+:\d+:[^:]+:[^:]+$/.test(process.env.ADMIN_PASSWORD_HASH!.trim())
        ? 'set'
        : 'WRONG FORMAT — should start with scrypt:'
      : has('ADMIN_PASSWORD')
        ? 'not set (ADMIN_PASSWORD is used instead)'
        : 'MISSING',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: has('NEXT_PUBLIC_VAPID_PUBLIC_KEY') ? 'set' : 'missing (reminders off)',
    VAPID_PRIVATE_KEY: has('VAPID_PRIVATE_KEY') ? 'set' : 'missing (reminders off)',
    VAPID_SUBJECT: has('VAPID_SUBJECT') ? (/^(mailto:|https:)/.test(process.env.VAPID_SUBJECT!.trim()) ? 'set' : 'WRONG FORMAT — should start with mailto:') : 'missing',
    CRON_SECRET: has('CRON_SECRET') ? 'set' : 'missing (evening reminder off)',
  };

  let databaseConnection = 'not tried (no database setting)';
  if (env.databaseUrl) {
    try {
      await queryOne('SELECT 1');
      databaseConnection = 'ok';
    } catch (err) {
      // Strip anything that looks like a connection string before showing the reason.
      const reason = (err instanceof Error ? err.message : String(err)).replace(/\b\w+:\/\/\S+/g, '[hidden]').slice(0, 300);
      databaseConnection = `FAILED — ${reason}`;
    }
  }

  // Any variable names that look like a value was pasted into the name box.
  const oddNames = Object.keys(process.env).filter((k) => /[^A-Za-z0-9_]/.test(k)).length;

  return NextResponse.json(
    { settings, databaseConnection, ...(oddNames ? { warning: `${oddNames} setting name(s) contain odd characters — check Environment Variables` } : {}) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
