import 'server-only';
import { newId } from '../crypto';
import { query, queryOne, transaction } from '../db';
import { HttpError } from '../http';
import { looksLikeXlsx, readWorkbook } from '../xlsx';
import { attendeeRolls, parsePlacementEmail, rollsInText } from './parse';
import { inviteEnd, remindersDue, startInstant } from './reminders';

/**
 * Placement (Pre-Placement Talk) events: filled in from emails, shown to the admin as pending,
 * and only after approval do students hear about them.
 */

export interface PlacementEmail {
  id: string;
  threadUrl: string | null;
  subject: string;
  receivedAt: string;
  body: string;
  attachments: { name: string; dataBase64: string }[];
}

export type PlacementStatus = 'pending' | 'approved' | 'dismissed' | 'skipped';

export type PlacementView = {
  id: string;
  company: string | null;
  title: string;
  date: string | null;
  time: string | null;
  endTime: string | null;
  venue: string | null;
  notes: string;
  status: 'pending' | 'approved' | 'dismissed' | 'skipped';
  replacesId: string | null;
  inviteSentAt: string | null;
  createdAt: string;
  attendees: { rollNo: string; name: string; hasEmail: boolean }[];
};

export type InviteTask = {
  eventId: string;
  title: string;
  startIso: string;
  endIso: string;
  location: string | null;
  description: string;
  /** Students to invite. When the task updates an existing event, only those not yet on it. */
  guests: string[];
  /** The Calendar event students already have from the PPT this one corrects, to be updated in place. */
  updateCalendarEventId: string | null;
  /** The corrected PPT's own id, for an event its script created but has not confirmed yet. */
  replacesEventId: string | null;
};

/** A withdrawn PPT whose Calendar event the script should delete. */
export type CancelTask = { eventId: string; calendarEventId: string };

async function listedSectionEStudents(rolls: string[]): Promise<string[]> {
  if (!rolls.length) return [];
  const rows = await query<{ roll_no: string }>(
    'SELECT roll_no FROM students WHERE active AND upper(roll_no) = ANY($1::text[]) ORDER BY roll_no',
    [rolls.map((r) => r.toUpperCase())],
  );
  return rows.map((r) => r.roll_no);
}

const UNREADABLE_NOTE = "The attendee list couldn't be read. Open the email to check it.";

/** Rolls from every spreadsheet, and whether any attachment could not be read as a spreadsheet. */
async function rollsFromAttachments(attachments: PlacementEmail['attachments']): Promise<{ rolls: string[]; readable: number; unreadable: boolean }> {
  const found = new Set<string>();
  let readable = 0;
  let unreadable = false;
  for (const a of attachments) {
    // Only spreadsheets are attendee lists; PDFs, images and signatures are ignored.
    if (!/\.xlsx?$/i.test(a.name.trim())) continue;
    try {
      const buf = Buffer.from(a.dataBase64, 'base64');
      if (!looksLikeXlsx(buf)) throw new Error('Not an .xlsx file.');
      for (const r of attendeeRolls(await readWorkbook(buf))) found.add(r);
      readable++;
    } catch (err) {
      unreadable = true;
      console.error(`Placement attachment "${a.name}" could not be read:`, err);
    }
  }
  return { rolls: [...found], readable, unreadable };
}

/**
 * Stores each new email once (by its id). An email whose list has no Section E students is kept as
 * 'skipped' so it is not looked at again; the rest wait as 'pending' for the admin.
 */
export async function ingestPlacementEmails(emails: PlacementEmail[]): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;
  for (const email of emails) {
    if (await queryOne('SELECT 1 FROM placement_events WHERE source_email_id = $1', [email.id])) continue;
    const details = parsePlacementEmail({ subject: email.subject, body: email.body, receivedAt: email.receivedAt });
    const list = await rollsFromAttachments(email.attachments);
    const rolls = await listedSectionEStudents(list.rolls);
    // A list that was read and has nobody from Section E is set aside. One that could not be read
    // stays visible to the admin, who can open the email.
    const unreadable = !rolls.length && list.unreadable;
    const status: PlacementStatus = rolls.length || unreadable ? 'pending' : 'skipped';
    const notes = unreadable ? [...details.notes, UNREADABLE_NOTE] : details.notes;
    const id = newId();
    const inserted = await transaction(async (tx) => {
      let replacesId: string | null = null;
      if (status === 'pending' && details.company && details.date) {
        const prior = await tx.query<{ id: string }>(
          `SELECT id FROM placement_events
            WHERE status = 'approved' AND on_date = $2::date AND lower(company) = lower($1)
            ORDER BY approved_at DESC NULLS LAST LIMIT 1`,
          [details.company, details.date],
        );
        replacesId = prior.rows[0]?.id ?? null;
      }
      const res = await tx.query<{ id: string }>(
        `INSERT INTO placement_events (id, company, title, on_date, at_time, venue, notes, source_email_id, thread_url, replaces_id, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (source_email_id) DO NOTHING RETURNING id`,
        [id, details.company ?? '', details.title, details.date, details.time, details.venue, notes.join('\n'), email.id, email.threadUrl, replacesId, status],
      );
      if (!res.rows.length) return false;
      for (const roll of rolls) {
        await tx.query('INSERT INTO placement_attendees (event_id, roll_no) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, roll]);
      }
      return true;
    });
    if (!inserted) continue;
    if (status === 'pending') added++;
    else skipped++;
  }
  return { added, skipped };
}

interface EventRow {
  id: string;
  company: string;
  title: string;
  date: string | null;
  time: string | null;
  end_time: string | null;
  venue: string | null;
  notes: string;
  status: PlacementStatus;
  replaces_id: string | null;
  invite_sent_at: Date | null;
  created_at: Date;
}

const EVENT_COLS = `id, company, title, on_date::text AS date, at_time AS time, end_time, venue, notes, status, replaces_id, invite_sent_at, created_at`;

async function viewsFor(rows: EventRow[]): Promise<PlacementView[]> {
  if (!rows.length) return [];
  const people = await query<{ event_id: string; roll_no: string; name: string; has_email: boolean }>(
    `SELECT a.event_id, a.roll_no, s.name, (s.email IS NOT NULL AND s.email <> '') AS has_email
       FROM placement_attendees a JOIN students s ON s.roll_no = a.roll_no
      WHERE a.event_id = ANY($1::text[]) ORDER BY s.name`,
    [rows.map((r) => r.id)],
  );
  return rows.map((r) => ({
    id: r.id,
    company: r.company || null,
    title: r.title,
    date: r.date,
    time: r.time,
    endTime: r.end_time,
    venue: r.venue,
    notes: r.notes,
    status: r.status,
    replacesId: r.replaces_id,
    inviteSentAt: r.invite_sent_at ? new Date(r.invite_sent_at).toISOString() : null,
    createdAt: new Date(r.created_at).toISOString(),
    attendees: people.filter((p) => p.event_id === r.id).map((p) => ({ rollNo: p.roll_no, name: p.name, hasEmail: p.has_email })),
  }));
}

/** Everything the admin can act on, newest first (skipped emails are left out). */
export async function listPlacements(): Promise<PlacementView[]> {
  const rows = await query<EventRow>(`SELECT ${EVENT_COLS} FROM placement_events WHERE status <> 'skipped' ORDER BY created_at DESC`);
  return viewsFor(rows);
}

async function viewOf(id: string): Promise<PlacementView> {
  const row = await queryOne<EventRow>(`SELECT ${EVENT_COLS} FROM placement_events WHERE id = $1`, [id]);
  if (!row) throw new HttpError(404, 'That PPT no longer exists.', 'not_found');
  return (await viewsFor([row]))[0]!;
}

export async function approvePlacement(
  id: string,
  edits: { title?: string; date?: string; time?: string; endTime?: string; venue?: string; notes?: string },
): Promise<PlacementView> {
  await transaction(async (tx) => {
    const cur = (await tx.query<EventRow>(`SELECT ${EVENT_COLS} FROM placement_events WHERE id = $1 FOR UPDATE`, [id])).rows[0];
    if (!cur) throw new HttpError(404, 'That PPT no longer exists.', 'not_found');
    if (cur.status !== 'pending') throw new HttpError(409, 'This PPT has already been handled.', 'conflict');
    const date = edits.date ?? cur.date;
    const time = edits.time ?? cur.time;
    if (!date || !time) throw new HttpError(400, 'Add the date and time before approving.');
    await tx.query(
      `UPDATE placement_events
          SET title = $2, on_date = $3::date, at_time = $4, end_time = $5, venue = $6, notes = $7,
              status = 'approved', approved_at = now()
        WHERE id = $1`,
      [id, edits.title ?? cur.title, date, time, edits.endTime ?? cur.end_time, edits.venue ?? cur.venue, edits.notes ?? cur.notes],
    );
    // Approval already tells students "now", so a reminder window that is open at this moment is spent.
    const now = new Date();
    const open = remindersDue({ date, time, remindedEveAt: null, remindedHourAt: null }, now);
    if (open.includes('eve')) await tx.query('UPDATE placement_events SET reminded_eve_at = $2 WHERE id = $1', [id, now.toISOString()]);
    if (open.includes('hour')) await tx.query('UPDATE placement_events SET reminded_hour_at = $2 WHERE id = $1', [id, now.toISOString()]);
    // A corrected email takes over from the PPT it replaces.
    if (cur.replaces_id) {
      await tx.query(`UPDATE placement_events SET status = 'dismissed' WHERE id = $1 AND status = 'approved'`, [cur.replaces_id]);
    }
  });
  return viewOf(id);
}

export async function dismissPlacement(id: string): Promise<void> {
  const res = await query<{ id: string }>(`UPDATE placement_events SET status = 'dismissed' WHERE id = $1 AND status = 'pending' RETURNING id`, [id]);
  if (res.length) return;
  if (!(await queryOne('SELECT 1 FROM placement_events WHERE id = $1', [id]))) throw new HttpError(404, 'That PPT no longer exists.', 'not_found');
  throw new HttpError(409, 'Only a pending PPT can be dismissed. Withdraw an approved one instead.', 'conflict');
}

/**
 * Takes an approved PPT back: students stop seeing it and hearing about it, and if a Calendar event
 * was created for it the script is told to delete it. (When it only replaced an earlier PPT and its own
 * update was not confirmed yet, the earlier PPT's event is the one to delete.)
 */
export async function withdrawPlacement(id: string): Promise<void> {
  const res = await query<{ id: string }>(
    `UPDATE placement_events
        SET status = 'dismissed', withdrawn_at = now(),
            calendar_event_id = COALESCE(calendar_event_id, (SELECT p.calendar_event_id FROM placement_events p WHERE p.id = placement_events.replaces_id))
      WHERE id = $1 AND status = 'approved' RETURNING id`,
    [id],
  );
  if (res.length) return;
  if (!(await queryOne('SELECT 1 FROM placement_events WHERE id = $1', [id]))) throw new HttpError(404, 'That PPT no longer exists.', 'not_found');
  throw new HttpError(409, 'Only an approved PPT can be withdrawn.', 'conflict');
}

/**
 * Replaces a pending card's attendees with the Section E students found in pasted text (the fallback
 * when the spreadsheet could not be read). Returns how many students are now listed.
 */
export async function replaceAttendees(id: string, text: string): Promise<number> {
  const rolls = await listedSectionEStudents(rollsInText(text));
  if (!rolls.length) throw new HttpError(400, 'No Section E roll numbers found in that text. The list was not changed.');
  await transaction(async (tx) => {
    const cur = (await tx.query<{ status: PlacementStatus }>('SELECT status FROM placement_events WHERE id = $1 FOR UPDATE', [id])).rows[0];
    if (!cur) throw new HttpError(404, 'That PPT no longer exists.', 'not_found');
    if (cur.status !== 'pending') throw new HttpError(409, 'This PPT has already been handled.', 'conflict');
    await tx.query('DELETE FROM placement_attendees WHERE event_id = $1', [id]);
    for (const roll of rolls) await tx.query('INSERT INTO placement_attendees (event_id, roll_no) VALUES ($1, $2) ON CONFLICT DO NOTHING', [id, roll]);
  });
  return rolls.length;
}

export type PlacementLike = { id: string; title: string; date: string; time: string; venue: string | null; notes: string; endTime?: string | null };

/** Approved PPTs from today on that this student is listed for. */
export async function placementsFor(rollNo: string, today: string): Promise<PlacementLike[]> {
  return query<PlacementLike & { company: string }>(
    `SELECT e.id, e.company, e.title, e.on_date::text AS date, e.at_time AS time, e.end_time AS "endTime", e.venue, e.notes
       FROM placement_events e JOIN placement_attendees a ON a.event_id = e.id
      WHERE e.status = 'approved' AND a.roll_no = $1 AND e.on_date >= $2::date
      ORDER BY e.on_date, e.at_time`,
    [rollNo, today],
  );
}

const CLAIM_MS = 2 * 3600 * 1000;

/**
 * Calendar invites the admin's Apps Script still has to create: approved events with no invite yet.
 * Each is claimed for 2 hours so a second check-in doesn't hand it out again; if the script never
 * confirms, it comes back after that. A correction of a PPT that already has a Calendar event comes
 * back as an update of that event (only students not on it yet are listed as guests). A PPT with
 * nobody to email is looked at again at every check-in, so addresses added later still get an invite.
 */
export async function inviteTasks(now: Date): Promise<InviteTask[]> {
  const claimed = await query<{ id: string; title: string; date: string; time: string; end_time: string | null; venue: string | null; notes: string; replaces_id: string | null }>(
    `UPDATE placement_events SET invite_claimed_at = $1
      WHERE status = 'approved' AND invite_sent_at IS NULL AND on_date IS NOT NULL AND at_time IS NOT NULL
        AND on_date >= ($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date
        AND (invite_claimed_at IS NULL OR invite_claimed_at < $2)
      RETURNING id, title, on_date::text AS date, at_time AS time, end_time, venue, notes, replaces_id`,
    [now.toISOString(), new Date(now.getTime() - CLAIM_MS).toISOString()],
  );
  const tasks: InviteTask[] = [];
  for (const e of claimed) {
    const old = e.replaces_id
      ? await queryOne<{ calendar_event_id: string | null; invite_sent_at: Date | null }>('SELECT calendar_event_id, invite_sent_at FROM placement_events WHERE id = $1', [e.replaces_id])
      : null;
    const guests = (
      await query<{ email: string }>(
        `SELECT s.email FROM placement_attendees a JOIN students s ON s.roll_no = a.roll_no
          WHERE a.event_id = $1 AND s.active AND s.email IS NOT NULL AND s.email <> ''
            AND a.roll_no NOT IN (
              SELECT oa.roll_no FROM placement_attendees oa
                JOIN placement_events oe ON oe.id = oa.event_id
               WHERE oe.id = $2 AND oe.invite_sent_at IS NOT NULL)
          ORDER BY s.email`,
        [e.id, e.replaces_id],
      )
    ).map((g) => g.email);
    const updateCalendarEventId = old?.calendar_event_id ?? null;
    if (!guests.length && !updateCalendarEventId) {
      // Everyone listed was already invited to the PPT this one replaces: nothing for the script to do.
      // Otherwise nobody has an address yet: release the claim so the next check-in looks again.
      if (old?.invite_sent_at) await query('UPDATE placement_events SET invite_sent_at = $2 WHERE id = $1', [e.id, now.toISOString()]);
      else await query('UPDATE placement_events SET invite_claimed_at = NULL WHERE id = $1', [e.id]);
      continue;
    }
    tasks.push({
      eventId: e.id,
      title: e.title,
      startIso: startInstant(e.date, e.time).toISOString(),
      endIso: inviteEnd(e.date, e.time, e.end_time).toISOString(),
      location: e.venue,
      description: e.notes,
      guests,
      updateCalendarEventId,
      replacesEventId: e.replaces_id,
    });
  }
  return tasks;
}

/**
 * Records the Calendar event for an invite. A PPT that was taken over by a correction or withdrawn
 * while the script was creating its event is still recorded, so the event can be found and cancelled.
 */
export async function confirmInvite(eventId: string, calendarEventId: string): Promise<void> {
  const res = await query<{ id: string }>(
    `UPDATE placement_events SET invite_sent_at = now(), calendar_event_id = $2
      WHERE id = $1 AND (status = 'approved' OR (status = 'dismissed' AND calendar_event_id IS NULL)) RETURNING id`,
    [eventId, calendarEventId],
  );
  if (!res.length) throw new HttpError(404, 'No approved PPT with that id.', 'not_found');
}

/** Withdrawn PPTs whose Calendar event the script still has to delete (claimed for 2 hours at a time). */
export async function cancelTasks(now: Date): Promise<CancelTask[]> {
  const rows = await query<{ id: string; calendar_event_id: string }>(
    `UPDATE placement_events SET cancel_claimed_at = $1
      WHERE withdrawn_at IS NOT NULL AND calendar_event_id IS NOT NULL AND cancel_sent_at IS NULL
        AND (cancel_claimed_at IS NULL OR cancel_claimed_at < $2)
      RETURNING id, calendar_event_id`,
    [now.toISOString(), new Date(now.getTime() - CLAIM_MS).toISOString()],
  );
  return rows.map((r) => ({ eventId: r.id, calendarEventId: r.calendar_event_id }));
}

export async function confirmCancel(eventId: string): Promise<void> {
  const res = await query<{ id: string }>(`UPDATE placement_events SET cancel_sent_at = now() WHERE id = $1 AND withdrawn_at IS NOT NULL RETURNING id`, [eventId]);
  if (!res.length) throw new HttpError(404, 'No withdrawn PPT with that id.', 'not_found');
}
