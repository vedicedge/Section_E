import 'server-only';
import { query, transaction, type Queryable } from './db';
import { newId } from './crypto';
import { todayISO, addDays } from './time';
import type { KeyDate, KeyDateKind } from './coming-up';

/** Admin-entered dates: exams, TOD presentations, quizzes and events (feeds "Coming up" and the countdown). */

type Row = { id: string; kind: KeyDateKind; subject: string | null; title: string; on_date: string; at_time: string | null; details: string };

const toKeyDate = (r: Row): KeyDate => ({ id: r.id, kind: r.kind, subject: r.subject, title: r.title, onDate: r.on_date, atTime: r.at_time, details: r.details });

/** Admin list: everything from a week ago onwards (older dates are history). */
export async function listKeyDatesForAdmin(today = todayISO()): Promise<KeyDate[]> {
  const rows = await query<Row>('SELECT id, kind, subject, title, on_date, at_time, details FROM key_dates WHERE on_date >= $1 ORDER BY on_date, at_time NULLS LAST', [
    addDays(today, -7),
  ]);
  return rows.map(toKeyDate);
}

/** Dates from today on (for the student views). */
export async function upcomingKeyDates(today = todayISO()): Promise<KeyDate[]> {
  try {
    const rows = await query<Row>('SELECT id, kind, subject, title, on_date, at_time, details FROM key_dates WHERE on_date >= $1 ORDER BY on_date, at_time NULLS LAST', [today]);
    return rows.map(toKeyDate);
  } catch {
    return []; // not worth failing the landing page over
  }
}

export interface KeyDateInput {
  kind: KeyDateKind;
  subject: string | null;
  title: string;
  onDate: string;
  atTime: string | null;
  details: string;
}

/** All or nothing: a pasted exam schedule is saved whole or not at all. */
export async function addKeyDates(items: KeyDateInput[]) {
  await transaction(async (tx) => {
    for (const d of items) await insert(tx, d);
  });
}

async function insert(tx: Queryable, d: KeyDateInput) {
  await tx.query('INSERT INTO key_dates (id, kind, subject, title, on_date, at_time, details) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
    newId(),
    d.kind,
    d.subject,
    d.title,
    d.onDate,
    d.atTime,
    d.details,
  ]);
}

export async function deleteKeyDate(id: string) {
  await query('DELETE FROM key_dates WHERE id = $1', [id]);
}
