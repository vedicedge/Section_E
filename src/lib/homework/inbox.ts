import 'server-only';
import { newId, safeEqual, sha256 } from '../crypto';
import { query, queryOne } from '../db';
import { HttpError } from '../http';
import { cleanName } from '../names';
import { getSetting, setSetting } from '../settings';
import { todayISO } from '../time';
import { suggestFromEmail } from './email';

/**
 * The homework inbox: a Google Apps Script in the admin's college mailbox sends new faculty emails
 * here; deadlines found in them wait as suggestions until the admin adds or dismisses each one.
 * Nothing reaches students without that click.
 */

const SETTING_KEY = 'homework.inbox';
/** The script runs every 30 minutes; after this long without a check-in the admin page says so. */
export const INBOX_QUIET_MS = 6 * 3600 * 1000;

interface InboxSetting {
  keyHash: string | null;
  lastCheckIn: string | null;
  lastAdded: number;
}

export interface InboxEmail {
  id: string;
  threadUrl: string | null;
  from: string;
  fromName: string;
  subject: string;
  receivedAt: string;
  body: string;
}

export interface Suggestion {
  id: string;
  threadUrl: string | null;
  senderName: string;
  senderEmail: string;
  emailSubject: string;
  receivedAt: string;
  receivedOn: string;
  excerpt: string;
  title: string;
  dueMode: 'next_class' | 'date' | null;
  dueDate: string | null;
}

interface SuggestionRow {
  id: string;
  thread_url: string | null;
  sender_name: string;
  sender_email: string;
  email_subject: string;
  received_at: Date;
  excerpt: string;
  title: string;
  due_mode: 'next_class' | 'date' | null;
  due_date: string | null;
}

function toSuggestion(r: SuggestionRow): Suggestion {
  const receivedAt = new Date(r.received_at);
  return {
    id: r.id,
    threadUrl: r.thread_url,
    senderName: r.sender_name,
    senderEmail: r.sender_email,
    emailSubject: r.email_subject,
    receivedAt: receivedAt.toISOString(),
    receivedOn: todayISO(receivedAt),
    excerpt: r.excerpt,
    title: r.title,
    dueMode: r.due_mode,
    dueDate: r.due_date,
  };
}

async function readSetting(): Promise<InboxSetting> {
  const saved = await getSetting<Partial<InboxSetting>>(SETTING_KEY);
  return { keyHash: saved?.keyHash ?? null, lastCheckIn: saved?.lastCheckIn ?? null, lastAdded: saved?.lastAdded ?? 0 };
}

/* ------------------------------------------------------------------ key */

/** Creates a new inbox key (the old one stops working), stores only its hash, and returns it once. */
export async function rotateInboxKey(): Promise<string> {
  const key = `hw_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await setSetting(SETTING_KEY, { ...(await readSetting()), keyHash: sha256(key), lastCheckIn: null, lastAdded: 0 });
  return key;
}

export async function verifyInboxKey(presented: string | null): Promise<boolean> {
  if (!presented) return false;
  const { keyHash } = await readSetting();
  return Boolean(keyHash && safeEqual(sha256(presented), keyHash));
}

export async function inboxStatus() {
  const s = await readSetting();
  return { hasKey: Boolean(s.keyHash), lastCheckIn: s.lastCheckIn, lastAdded: s.lastAdded, quietHours: INBOX_QUIET_MS / 3600_000 };
}

export type InboxStatus = Awaited<ReturnType<typeof inboxStatus>>;

/* --------------------------------------------------------------- ingest */

/**
 * Stores a suggestion for each email that mentions a deadline. Emails seen before (by message id)
 * are skipped, including ones the admin already dismissed. Returns how many were new.
 */
export async function ingestEmails(emails: InboxEmail[]): Promise<{ added: number; skipped: number }> {
  let added = 0;
  for (const email of emails) {
    const receivedAt = new Date(email.receivedAt);
    const found = suggestFromEmail({ subject: email.subject, body: email.body, receivedOn: todayISO(receivedAt) });
    if (!found) continue;
    const rows = await query<{ id: string }>(
      `INSERT INTO homework_suggestions
         (id, message_id, thread_url, sender_name, sender_email, email_subject, received_at, excerpt, title, due_mode, due_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (message_id) DO NOTHING
       RETURNING id`,
      [
        newId(),
        email.id,
        email.threadUrl,
        cleanName(email.fromName),
        email.from.toLowerCase(),
        email.subject,
        receivedAt.toISOString(),
        found.excerpt,
        found.title,
        found.dueMode,
        found.dueDate,
      ],
    );
    added += rows.length;
  }
  const setting = await readSetting();
  await setSetting(SETTING_KEY, { ...setting, lastCheckIn: new Date().toISOString(), lastAdded: added });
  return { added, skipped: emails.length - added };
}

/* -------------------------------------------------------------- review */

export async function pendingSuggestions(): Promise<Suggestion[]> {
  const rows = await query<SuggestionRow>(`SELECT * FROM homework_suggestions WHERE status = 'pending' ORDER BY received_at DESC LIMIT 100`);
  return rows.map(toSuggestion);
}

/**
 * Marks a pending suggestion as handled and returns it. The status check makes two admins (or two
 * clicks) unable to add the same suggestion twice.
 */
export async function claimSuggestion(id: string, status: 'added' | 'dismissed'): Promise<Suggestion> {
  const row = await queryOne<SuggestionRow>(
    `UPDATE homework_suggestions SET status = $2, decided_at = now() WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, status],
  );
  if (!row) throw new HttpError(409, 'That suggestion was already handled. Refresh the page to see the latest list.', 'already_handled');
  return toSuggestion(row);
}

/** Puts a claimed suggestion back in the queue (used when adding the homework failed). */
export async function releaseSuggestion(id: string) {
  await query(`UPDATE homework_suggestions SET status = 'pending', decided_at = NULL, homework_id = NULL WHERE id = $1`, [id]);
}

export async function linkSuggestion(id: string, homeworkId: string) {
  await query(`UPDATE homework_suggestions SET homework_id = $2 WHERE id = $1`, [id, homeworkId]);
}
