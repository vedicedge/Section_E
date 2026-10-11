import { safeEqual } from '@/lib/crypto';
import { env } from '@/lib/env';
import { fail, ok } from '@/lib/http';
import { sendDueReminders } from '@/lib/notify';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Evening reminder job. Vercel Cron calls it from vercel.json and sends CRON_SECRET as a Bearer
 * token; any other scheduler can do the same. Runs once per date (repeat calls are no-ops).
 */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  if (!secret) {
    return fail(503, 'CRON_SECRET is not set, so the scheduled homework reminder is switched off. Set it in the environment and redeploy.', 'not_configured');
  }
  if (!safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return fail(401, 'Missing or wrong cron secret.', 'unauthorized');
  }
  try {
    return ok(await sendDueReminders());
  } catch (err) {
    console.error('[section-e] homework reminder job failed', err);
    return fail(500, 'Sending the homework reminders failed.', 'internal');
  }
}
