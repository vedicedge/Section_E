import 'server-only';
import { query, queryOne } from './db';
import { sha256 } from './crypto';
import { addDays, todayISO } from './time';
import { pushConfigured, sendPush, subscribedRolls, type SendResult } from './push';
import { doneIds, homeworkDueOn, type HomeworkView } from './homework/repo';
import { newHomeworkPayload, reminderPayload } from './homework/messages';

/** Homework notifications: the evening-before reminder and the "new homework" ping. */

/** Claims a notification key; false when another run already has it (two cron calls can overlap). */
async function claim(key: string): Promise<boolean> {
  return Boolean(await queryOne(`INSERT INTO notification_log (key, recipients, detail) VALUES ($1, 0, 'sending') ON CONFLICT (key) DO NOTHING RETURNING key`, [key]));
}

async function release(key: string) {
  await query('DELETE FROM notification_log WHERE key = $1', [key]);
}

async function record(key: string, recipients: number, detail: string) {
  await query(
    `INSERT INTO notification_log (key, recipients, detail) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET sent_at = now(), recipients = EXCLUDED.recipients, detail = EXCLUDED.detail`,
    [key, recipients, detail],
  );
}

export interface ReminderResult {
  date: string;
  homework: number;
  students: number;
  push: SendResult | null;
  skipped: null | 'not_configured' | 'already_sent' | 'nothing_due' | 'no_subscribers';
}

/**
 * Reminds every subscribed student about homework due on `date` (default: tomorrow) that they
 * have not ticked off. Runs once per date unless `force` (the admin's "send now").
 */
export async function sendDueReminders(opts: { date?: string; force?: boolean } = {}): Promise<ReminderResult> {
  const date = opts.date ?? addDays(todayISO(), 1);
  const base: ReminderResult = { date, homework: 0, students: 0, push: null, skipped: null };
  if (!pushConfigured()) return { ...base, skipped: 'not_configured' };
  const key = `due-reminder:${date}`;
  if (!opts.force && !(await claim(key))) return { ...base, skipped: 'already_sent' };
  // Unclaimed when nothing went out, so homework added later that evening can still be reminded.
  const unclaim = () => (opts.force ? Promise.resolve() : release(key));

  let students = 0;
  try {
    const due = await homeworkDueOn(date);
    if (!due.length) {
      await unclaim();
      return { ...base, skipped: 'nothing_due' };
    }
    const rolls = await subscribedRolls();
    if (!rolls.length) {
      await unclaim();
      return { ...base, homework: due.length, skipped: 'no_subscribers' };
    }

    const total: SendResult = { sent: 0, failed: 0, removed: 0 };
    for (const roll of rolls) {
      const done = await doneIds(roll);
      const pending = due.filter((h) => !done.has(h.id));
      if (!pending.length) continue;
      const res = await sendPush([roll], reminderPayload(pending, date));
      students++;
      total.sent += res.sent;
      total.failed += res.failed;
      total.removed += res.removed;
    }
    await record(key, students, `${due.length} homework item(s)`);
    return { ...base, homework: due.length, students, push: total };
  } catch (err) {
    if (students === 0) await unclaim().catch(() => {});
    throw err;
  }
}

/** Pings everyone about freshly posted homework. De-duplicated per set of items. */
export async function notifyNewHomework(items: HomeworkView[]): Promise<SendResult | null> {
  if (!items.length || !pushConfigured()) return null;
  const key = `new-homework:${sha256(items.map((i) => i.id).sort().join(','))}`;
  if (!(await claim(key))) return null;
  const res = await sendPush('all', newHomeworkPayload(items, todayISO())).catch(async (err) => {
    await release(key).catch(() => {});
    throw err;
  });
  await record(key, res.sent, `${items.length} item(s)`);
  return res;
}

export async function lastReminder(): Promise<{ key: string; sentAt: string; recipients: number } | null> {
  const row = await queryOne<{ key: string; sent_at: Date; recipients: number }>(
    `SELECT key, sent_at, recipients FROM notification_log WHERE key LIKE 'due-reminder:%' ORDER BY sent_at DESC LIMIT 1`,
  );
  return row ? { key: row.key, sentAt: new Date(row.sent_at).toISOString(), recipients: Number(row.recipients) } : null;
}
