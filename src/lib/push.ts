import 'server-only';
import webpush from 'web-push';
import { env } from './env';
import { query, queryOne } from './db';
import type { PushPayload } from './homework/messages';

/**
 * Web Push (works on Android, desktop browsers, and iPhone when the site is added to the Home
 * Screen). Subscriptions are tied to a roll number so reminders can be personal.
 */

export function pushConfigured(): boolean {
  return Boolean(env.vapidPublicKey && env.vapidPrivateKey);
}

let configured = false;
function ensureVapid() {
  if (!pushConfigured()) throw new Error('Push notifications are not configured (VAPID keys missing).');
  if (!configured) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey!, env.vapidPrivateKey!);
    configured = true;
  }
}

/**
 * The server POSTs to whatever endpoint is stored, so only the browsers' own push services are
 * accepted (Chrome/Android, Firefox, Safari, Edge) — never an arbitrary or internal URL.
 * The raw string is checked rather than a parsed URL: web-push connects using Node's legacy URL
 * parser, which reads some strings (e.g. "https://evil.example;.fcm.googleapis.com/") as a
 * different host than the WHATWG parser does.
 */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];
const PUSH_URL = /^https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)\/[\x21-\x5b\x5d-\x7e]*$/i;

export function isPushService(endpoint: string): boolean {
  const host = PUSH_URL.exec(endpoint)?.[1]?.toLowerCase();
  return Boolean(host && PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)));
}

/** Rejects after `ms` so one unresponsive push service can't hold up the whole send. */
function within<T>(ms: number, promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Push service timed out.')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(rollNo: string, sub: SubscriptionInput, userAgent: string | null) {
  await query(
    `INSERT INTO push_subscriptions (endpoint, roll_no, p256dh, auth, user_agent) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET roll_no = EXCLUDED.roll_no, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent, failures = 0`,
    [sub.endpoint, rollNo, sub.keys.p256dh, sub.keys.auth, userAgent?.slice(0, 300) ?? null],
  );
}

/** Forget every device of a student (PIN reset, deactivation, removal). */
export async function removeAllSubscriptions(rollNo: string) {
  await query('DELETE FROM push_subscriptions WHERE roll_no = $1', [rollNo]);
}

export async function removeSubscription(endpoint: string, rollNo: string) {
  await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND roll_no = $2', [endpoint, rollNo]);
}

export async function hasSubscription(endpoint: string, rollNo: string): Promise<boolean> {
  return Boolean(await queryOne('SELECT 1 FROM push_subscriptions WHERE endpoint = $1 AND roll_no = $2', [endpoint, rollNo]));
}

/** Subscriptions only count (and only receive pushes) while their student is on the active roster. */
const ACTIVE = 'JOIN students st ON st.roll_no = ps.roll_no AND st.active';

export async function subscriptionStats(): Promise<{ devices: number; students: number }> {
  const row = await queryOne<{ devices: number; students: number }>(
    `SELECT count(*)::int AS devices, count(DISTINCT ps.roll_no)::int AS students FROM push_subscriptions ps ${ACTIVE}`,
  );
  return { devices: Number(row?.devices ?? 0), students: Number(row?.students ?? 0) };
}

/** Roll numbers that have at least one device subscribed. */
export async function subscribedRolls(): Promise<string[]> {
  const rows = await query<{ roll_no: string }>(`SELECT DISTINCT ps.roll_no FROM push_subscriptions ps ${ACTIVE}`);
  return rows.map((r) => r.roll_no);
}

interface SubRow {
  endpoint: string;
  roll_no: string;
  p256dh: string;
  auth: string;
}

export interface SendResult {
  sent: number;
  failed: number;
  removed: number;
}

/**
 * Sends one payload to every device of the given students ('all' = every subscriber).
 * Dead subscriptions (404/410) are removed; repeated failures are pruned after 8 attempts.
 */
export async function sendPush(rolls: string[] | 'all', payload: PushPayload): Promise<SendResult> {
  ensureVapid();
  const subs =
    rolls === 'all'
      ? await query<SubRow>(`SELECT ps.endpoint, ps.roll_no, ps.p256dh, ps.auth FROM push_subscriptions ps ${ACTIVE}`)
      : rolls.length
        ? await query<SubRow>(`SELECT ps.endpoint, ps.roll_no, ps.p256dh, ps.auth FROM push_subscriptions ps ${ACTIVE} WHERE ps.roll_no = ANY($1::text[])`, [
            rolls,
          ])
        : [];
  const result: SendResult = { sent: 0, failed: 0, removed: 0 };
  const body = JSON.stringify(payload);
  for (let i = 0; i < subs.length; i += 20) {
    const batch = subs.slice(i, i + 20);
    const outcomes = await Promise.allSettled(
      batch.map((s) =>
        isPushService(s.endpoint)
          ? within(
              15_000,
              webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
                TTL: 12 * 3600,
                urgency: 'normal',
                timeout: 10_000,
              }),
            )
          : Promise.reject(Object.assign(new Error('Not a push service endpoint.'), { statusCode: 410 })),
      ),
    );
    for (const [k, outcome] of outcomes.entries()) {
      const sub = batch[k]!;
      if (outcome.status === 'fulfilled') {
        result.sent++;
        await query('UPDATE push_subscriptions SET last_sent_at = now(), failures = 0 WHERE endpoint = $1', [sub.endpoint]);
        continue;
      }
      const status = (outcome.reason as { statusCode?: number })?.statusCode;
      if (status === 404 || status === 410) {
        result.removed++;
        await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [sub.endpoint]);
      } else {
        result.failed++;
        await query('UPDATE push_subscriptions SET failures = failures + 1 WHERE endpoint = $1', [sub.endpoint]);
        await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND failures > 8', [sub.endpoint]);
      }
    }
  }
  return result;
}
