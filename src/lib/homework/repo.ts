import 'server-only';
import { query, queryOne, transaction } from '../db';
import { newId } from '../crypto';
import { HttpError } from '../http';
import { matchSubject } from '../timetable/match';
import { getTimetable } from '../timetable/service';
import { activePlanSummaries, type PlanRecord } from '../seating/repo';
import { addDays, todayISO } from '../time';
import { bucketOf, compareDue, resolveDue, type DueBucket, type DueContext, type DueMode, type ResolvedDue } from './due';

export interface HomeworkRecord {
  id: string;
  subjectCode: string;
  subjectTitle: string;
  title: string;
  details: string;
  givenOn: string;
  dueMode: DueMode;
  dueDate: string | null;
  dueTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HomeworkView extends HomeworkRecord {
  due: ResolvedDue;
  bucket: DueBucket;
}

interface HomeworkRow {
  id: string;
  subject_code: string;
  subject_title: string;
  title: string;
  details: string;
  given_on: string;
  due_mode: DueMode;
  due_date: string | null;
  due_time: string | null;
  created_at: Date;
  updated_at: Date;
}

function toRecord(r: HomeworkRow): HomeworkRecord {
  return {
    id: r.id,
    subjectCode: r.subject_code,
    subjectTitle: r.subject_title,
    title: r.title,
    details: r.details,
    givenOn: r.given_on,
    dueMode: r.due_mode,
    dueDate: r.due_date,
    dueTime: r.due_time,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  };
}

/* ------------------------------------------------------------ subjects */

export interface SubjectOption {
  code: string;
  title: string;
}

/** Subjects homework can be set for: the class seating plans' codes (one per code). */
export async function homeworkSubjects(): Promise<SubjectOption[]> {
  const plans = await activePlanSummaries();
  const seen = new Map<string, SubjectOption>();
  for (const p of plans) if (p.kind === 'class' && !seen.has(p.code.toUpperCase())) seen.set(p.code.toUpperCase(), { code: p.code, title: p.title });
  return [...seen.values()];
}

/* ------------------------------------------------------ due resolution */

/**
 * Timetable context for resolving "next class" deadlines, or null when the timetable is off,
 * unavailable, or its layout couldn't be read.
 */
export async function loadDueContext(plans?: PlanRecord[]): Promise<DueContext | null> {
  const state = await getTimetable().catch(() => null);
  if (!state || (state.status !== 'ok' && state.status !== 'stale') || !state.data.detection.ok) return null;
  const subjects = (plans ?? (await activePlanSummaries())).filter((p) => p.kind === 'class');
  const cache = new Map<string, string | null>();
  return {
    sessions: state.data.sessions,
    subjectOf: (s) => {
      if (!cache.has(s.id)) cache.set(s.id, matchSubject(s.text, subjects)?.code ?? null);
      return cache.get(s.id)!;
    },
  };
}

/**
 * Resolves deadlines and refreshes the stored snapshot of next-class dates, so they survive a
 * later timetable outage.
 */
export async function resolveAll(records: HomeworkRecord[], ctx: DueContext | null, today = todayISO()): Promise<HomeworkView[]> {
  const views = records.map((r) => {
    const due = resolveDue(r, ctx);
    return { ...r, due, bucket: bucketOf(due, today) };
  });
  const stale = views.filter((v) => v.dueMode === 'next_class' && v.due.source === 'timetable' && (v.due.date !== v.dueDate || v.due.time !== v.dueTime));
  for (const v of stale) {
    await query('UPDATE homework SET due_date = $2, due_time = $3 WHERE id = $1', [v.id, v.due.date, v.due.time]);
  }
  return views.sort(compareDue);
}

/* ------------------------------------------------------------- queries */

/** Homework that can still matter: given in the last `days` days, or due from `days` ago onwards. */
export async function recentHomework(days = 45): Promise<HomeworkRecord[]> {
  const since = addDays(todayISO(), -days);
  const rows = await query<HomeworkRow>(
    `SELECT * FROM homework WHERE given_on >= $1 OR due_date >= $1 OR due_date IS NULL ORDER BY given_on DESC, created_at DESC LIMIT 500`,
    [since],
  );
  return rows.map(toRecord);
}

export async function getHomework(id: string): Promise<HomeworkRecord | null> {
  const row = await queryOne<HomeworkRow>('SELECT * FROM homework WHERE id = $1', [id]);
  return row ? toRecord(row) : null;
}

export async function doneIds(rollNo: string): Promise<Set<string>> {
  const rows = await query<{ homework_id: string }>('SELECT homework_id FROM homework_done WHERE roll_no = $1', [rollNo]);
  return new Set(rows.map((r) => r.homework_id));
}

export async function doneCounts(): Promise<Map<string, number>> {
  const rows = await query<{ homework_id: string; n: number }>('SELECT homework_id, count(*)::int AS n FROM homework_done GROUP BY homework_id');
  return new Map(rows.map((r) => [r.homework_id, Number(r.n)]));
}

export async function setDone(homeworkId: string, rollNo: string, done: boolean) {
  const exists = await queryOne<{ id: string }>('SELECT id FROM homework WHERE id = $1', [homeworkId]);
  if (!exists) throw new HttpError(404, 'That homework no longer exists.', 'not_found');
  if (done) {
    await query('INSERT INTO homework_done (homework_id, roll_no) VALUES ($1, $2) ON CONFLICT DO NOTHING', [homeworkId, rollNo]);
  } else {
    await query('DELETE FROM homework_done WHERE homework_id = $1 AND roll_no = $2', [homeworkId, rollNo]);
  }
}

/** Resolved homework for one student, with their own "done" ticks. */
export async function homeworkForStudent(rollNo: string) {
  const [records, done, ctx] = await Promise.all([recentHomework(), doneIds(rollNo), loadDueContext()]);
  const views = await resolveAll(records, ctx);
  return views.map((v) => ({ ...v, done: done.has(v.id) }));
}

/** Homework due on a given date (default tomorrow), resolved against the timetable. */
export async function homeworkDueOn(date: string): Promise<HomeworkView[]> {
  const [records, ctx] = await Promise.all([recentHomework(), loadDueContext()]);
  const views = await resolveAll(records, ctx);
  return views.filter((v) => v.due.date === date);
}

/* ---------------------------------------------------------- mutations */

export interface HomeworkInput {
  subjectCode: string;
  subjectTitle: string;
  title: string;
  details: string;
  givenOn: string;
  dueMode: DueMode;
  dueDate: string | null;
  dueTime: string | null;
}

function validate(input: HomeworkInput) {
  if (input.dueMode === 'date' && !input.dueDate) throw new HttpError(422, `${input.subjectCode}: pick a due date.`, 'invalid');
  if (input.dueMode === 'date' && input.dueDate! < input.givenOn) {
    throw new HttpError(422, `${input.subjectCode}: the due date is before the day it was given.`, 'invalid');
  }
}

/** Creates one or more homework items; next-class deadlines get an initial snapshot. */
export async function createHomework(items: HomeworkInput[]): Promise<HomeworkView[]> {
  items.forEach(validate);
  const ctx = await loadDueContext();
  const ids: string[] = [];
  await transaction(async (tx) => {
    for (const item of items) {
      const id = newId();
      ids.push(id);
      let { dueDate, dueTime } = item;
      if (item.dueMode === 'next_class') {
        const due = resolveDue({ ...item, dueDate: null, dueTime: null }, ctx);
        dueDate = due.date;
        dueTime = due.time;
      }
      await tx.query(
        `INSERT INTO homework (id, subject_code, subject_title, title, details, given_on, due_mode, due_date, due_time)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [id, item.subjectCode, item.subjectTitle, item.title, item.details, item.givenOn, item.dueMode, dueDate, dueTime],
      );
    }
  });
  const rows = await query<HomeworkRow>(`SELECT * FROM homework WHERE id = ANY($1::text[])`, [ids]);
  return resolveAll(rows.map(toRecord), ctx);
}

export async function updateHomework(id: string, input: HomeworkInput): Promise<HomeworkView> {
  validate(input);
  const ctx = await loadDueContext();
  let { dueDate, dueTime } = input;
  if (input.dueMode === 'next_class') {
    const due = resolveDue({ ...input, dueDate: null, dueTime: null }, ctx);
    dueDate = due.date;
    dueTime = due.time;
  }
  const row = await queryOne<HomeworkRow>(
    `UPDATE homework SET subject_code=$2, subject_title=$3, title=$4, details=$5, given_on=$6, due_mode=$7, due_date=$8, due_time=$9, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, input.subjectCode, input.subjectTitle, input.title, input.details, input.givenOn, input.dueMode, dueDate, dueTime],
  );
  if (!row) throw new HttpError(404, 'That homework no longer exists.', 'not_found');
  return (await resolveAll([toRecord(row)], ctx))[0]!;
}

export async function deleteHomework(id: string) {
  await query('DELETE FROM homework WHERE id = $1', [id]);
}

/** Admin list: everything recent, resolved, with how many students ticked each off. */
export async function homeworkForAdmin() {
  const [records, counts, ctx] = await Promise.all([recentHomework(90), doneCounts(), loadDueContext()]);
  const views = await resolveAll(records, ctx);
  return views.map((v) => ({ ...v, doneCount: counts.get(v.id) ?? 0 }));
}
