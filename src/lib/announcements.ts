import 'server-only';
import { query, queryOne } from './db';
import { newId } from './crypto';
import { pushConfigured, sendPush } from './push';
import { pushBody } from './announcement-text';
import { todayISO } from './time';

/**
 * Notices from the admin to the whole section. Each one is pushed to every subscribed device once,
 * shown on the home page until the student has seen it, and listed on /announcements.
 * "Seen" is kept per student only to count it: the admin sees a number, never who.
 */

export interface Announcement {
  id: string;
  title: string;
  body: string;
  link: string | null;
  /** Last day it is shown (inclusive); null = until deleted. */
  expiresOn: string | null;
  /** Devices the push reached; null when push isn't set up. */
  pushed: number | null;
  createdAt: string;
}

export interface AdminAnnouncement extends Announcement {
  seen: number;
}

type Row = { id: string; title: string; body: string; link: string | null; expires_on: string | null; pushed: number | null; created_at: Date };

function toAnnouncement(r: Row): Announcement {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    link: r.link,
    expiresOn: r.expires_on,
    pushed: r.pushed === null ? null : Number(r.pushed),
    createdAt: new Date(r.created_at).toISOString(),
  };
}

const COLS = 'a.id, a.title, a.body, a.link, a.expires_on, a.pushed, a.created_at';
/** Shown to students: not past its last day, and no older than 60 days. */
const LIVE = `(a.expires_on IS NULL OR a.expires_on >= $1::date) AND a.created_at > now() - interval '60 days'`;

export async function listAnnouncementsForAdmin(): Promise<{ items: AdminAnnouncement[]; students: number }> {
  const [rows, count] = await Promise.all([
    query<Row & { seen: number }>(
      `SELECT ${COLS}, (SELECT count(*)::int FROM announcement_seen s JOIN students st ON st.roll_no = s.roll_no AND st.active
                        WHERE s.announcement_id = a.id) AS seen
       FROM announcements a ORDER BY a.created_at DESC LIMIT 100`,
    ),
    queryOne<{ n: number }>('SELECT count(*)::int AS n FROM students WHERE active'),
  ]);
  return { items: rows.map((r) => ({ ...toAnnouncement(r), seen: Number(r.seen) })), students: Number(count?.n ?? 0) };
}

export async function liveAnnouncements(today = todayISO()): Promise<Announcement[]> {
  const rows = await query<Row>(`SELECT ${COLS} FROM announcements a WHERE ${LIVE} ORDER BY a.created_at DESC`, [today]);
  return rows.map(toAnnouncement);
}

/** The newest live announcement this student hasn't seen yet (for the home-page banner). */
export async function unseenAnnouncement(rollNo: string, today = todayISO()): Promise<(Announcement & { more: number }) | null> {
  const rows = await query<Row>(
    `SELECT ${COLS} FROM announcements a
     WHERE ${LIVE} AND NOT EXISTS (SELECT 1 FROM announcement_seen s WHERE s.announcement_id = a.id AND s.roll_no = $2)
     ORDER BY a.created_at DESC`,
    [today, rollNo],
  );
  if (!rows.length) return null;
  return { ...toAnnouncement(rows[0]!), more: rows.length - 1 };
}

export async function markSeen(rollNo: string, ids: string[]) {
  if (!ids.length) return;
  await query(
    `INSERT INTO announcement_seen (announcement_id, roll_no)
     SELECT a.id, $2 FROM announcements a WHERE a.id = ANY($1::text[])
     ON CONFLICT DO NOTHING`,
    [ids, rollNo],
  );
}

export interface AnnouncementInput {
  title: string;
  body: string;
  link: string | null;
  expiresOn: string | null;
  notify: boolean;
}

/** Saves the notice, then pushes it to every subscribed device (if asked and push is set up). */
export async function createAnnouncement(input: AnnouncementInput): Promise<{ id: string; pushed: number | null; failed: number }> {
  const id = newId();
  await query('INSERT INTO announcements (id, title, body, link, expires_on) VALUES ($1, $2, $3, $4, $5)', [
    id,
    input.title,
    input.body,
    input.link,
    input.expiresOn,
  ]);
  if (!input.notify || !pushConfigured()) return { id, pushed: null, failed: 0 };
  const result = await sendPush('all', { title: input.title, body: pushBody(input), url: '/announcements', tag: `announcement-${id}` });
  await query('UPDATE announcements SET pushed = $2 WHERE id = $1', [id, result.sent]);
  return { id, pushed: result.sent, failed: result.failed };
}

export async function deleteAnnouncement(id: string) {
  await query('DELETE FROM announcements WHERE id = $1', [id]);
}
