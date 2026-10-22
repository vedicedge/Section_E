import 'server-only';
import { query, queryOne, transaction } from '../db';
import { HttpError } from '../http';
import { subjectKey } from '../names';
import { setSetting } from '../settings';
import { activePlanSummaries, type PlanRecord } from '../seating/repo';
import { getTimetable } from '../timetable/service';
import { matchSubject } from '../timetable/match';
import { nextClassOf, type DueContext } from '../homework/due';
import { addDays, todayISO } from '../time';
import {
  DEFAULT_CONFIG,
  EMPTY_RECORD,
  configKeys,
  normaliseConfig,
  standing,
  validateRecord,
  type AttendanceConfig,
  type EditField,
  type HeartsResponse,
  type PatchResponse,
  type SubjectRecord,
  type SubjectRule,
} from './calc';

const CONFIG_KEY = 'attendance.config';
/** Admin totals for a subject are hidden below this many students counting (privacy). */
const MIN_CELL = 5;

export interface StudentSubjectView {
  id: string;
  code: string;
  title: string;
  /** The admin's session count (the student may override it). */
  defaultTotal: number;
  record: SubjectRecord;
  nextClass: { date: string; time: string | null } | null;
}

export interface AttendanceView {
  enabled: boolean;
  minPercent: number;
  termLabel: string;
  today: string;
  hasAnyRecord: boolean;
  subjects: StudentSubjectView[];
}

export interface AttendanceSummary {
  registered: number;
  tracking: number;
  minPercent: number;
  enabled: boolean;
  hearts: number;
  /** Per subject; null when fewer than 5 students count it. */
  subjects: { id: string; code: string; tracking: number | null; spent: number | null; over: number | null }[];
}

export type AttendanceConfigInput = Omit<AttendanceConfig, 'subjects'> & {
  subjects: (Omit<SubjectRule, 'id'> & { id?: string | null })[];
};

export type AttendancePatch = { subjectId: string; total?: number | null; held?: number | null; missed?: number };

/* -------------------------------------------------------------- config */

export async function getAttendanceSettings(): Promise<{ config: AttendanceConfig; updatedAt: string | null }> {
  const row = await queryOne<{ value: unknown; updated_at: string }>(
    'SELECT value, updated_at::text AS updated_at FROM app_settings WHERE key = $1',
    [CONFIG_KEY],
  );
  if (!row) return { config: normaliseConfig(DEFAULT_CONFIG), updatedAt: null };
  return { config: normaliseConfig(row.value), updatedAt: row.updated_at };
}

export async function getAttendanceConfig(): Promise<AttendanceConfig> {
  return (await getAttendanceSettings()).config;
}

/** For the menu and footer on every page: never throws. */
export async function isAttendanceEnabled(): Promise<boolean> {
  try {
    return (await getAttendanceConfig()).enabled;
  } catch {
    return false;
  }
}

/**
 * Saves the admin's rule and subjects. Ids are stable: an existing row keeps its id through a
 * rename, a new row gets subjectKey(code) — so re-adding a removed code brings its counts back.
 */
export async function saveAttendanceConfig(input: AttendanceConfigInput, baseUpdatedAt: string | null): Promise<AttendanceConfig> {
  const current = await getAttendanceSettings();
  if (baseUpdatedAt !== current.updatedAt) {
    throw new HttpError(409, 'Someone else saved these settings a moment ago — reload to see their changes.', 'stale');
  }
  const owner = new Map<string, (typeof input.subjects)[number]>();
  for (const s of input.subjects) {
    for (const key of configKeys(s)) {
      const other = owner.get(key);
      if (other && other !== s) throw new HttpError(422, `${other.code} and ${s.code} are the same subject.`, 'duplicate');
      owner.set(key, s);
    }
  }
  const known = new Set(current.config.subjects.map((s) => s.id));
  const explicit = new Map<string, (typeof input.subjects)[number]>();
  for (const s of input.subjects) {
    if (!s.id) continue;
    if (!known.has(s.id)) throw new HttpError(422, 'Unknown subject id.', 'invalid');
    const twin = explicit.get(s.id);
    if (twin) throw new HttpError(422, `${twin.code} and ${s.code} are the same subject.`, 'duplicate');
    explicit.set(s.id, s);
  }
  const subjects: SubjectRule[] = input.subjects.map((s) => {
    let id = s.id;
    if (!id) {
      id = subjectKey(s.code);
      if (!id) throw new HttpError(422, `${s.code}: a code needs at least one letter or digit.`, 'invalid');
      const other = explicit.get(id);
      if (other) throw new HttpError(422, `${s.code} clashes with ${other.code} — pick another code.`, 'invalid');
    }
    return { id, code: s.code, title: s.title, total: s.total, aliases: s.aliases };
  });
  // Two new rows can only share an id if they share a key, which is caught above; keep a guard anyway.
  if (new Set(subjects.map((s) => s.id)).size !== subjects.length) throw new HttpError(422, 'Two subjects share a code.', 'duplicate');

  const config = normaliseConfig({ enabled: input.enabled, minPercent: input.minPercent, termLabel: input.termLabel, subjects });
  await setSetting(CONFIG_KEY, config);
  return config;
}

/** Subject titles from the class seating plans, for subjects the admin left untitled. */
function withTitles(subjects: SubjectRule[], plans: PlanRecord[]): SubjectRule[] {
  if (subjects.every((s) => s.title)) return subjects;
  const titles = new Map<string, string>();
  for (const p of plans) if (p.kind === 'class' && !titles.has(subjectKey(p.code))) titles.set(subjectKey(p.code), p.title);
  return subjects.map((s) => ({ ...s, title: s.title || configKeys(s).map((k) => titles.get(k)).find(Boolean) || '' }));
}

/* ------------------------------------------------------------- student */

interface Row {
  subject_id: string;
  total_override: number | null;
  held: number | null;
  held_on: string | null;
  missed: number;
}

function toRecord(r: Row): SubjectRecord {
  return {
    totalOverride: r.total_override === null ? null : Number(r.total_override),
    held: r.held === null ? null : Number(r.held),
    heldOn: r.held_on,
    missed: Number(r.missed),
  };
}

/** Timetable context matching sessions to the attendance subjects, or null when unavailable. */
async function attendanceDueContext(subjects: SubjectRule[]): Promise<DueContext | null> {
  const state = await getTimetable().catch(() => null);
  if (!state || (state.status !== 'ok' && state.status !== 'stale') || !state.data.detection.ok) return null;
  const refs = subjects.map((s) => ({ code: s.code, title: s.title, aliases: s.aliases }));
  const cache = new Map<string, string | null>();
  return {
    sessions: state.data.sessions,
    subjectOf: (s) => {
      if (!cache.has(s.id)) cache.set(s.id, matchSubject(s.text, refs)?.code ?? null);
      return cache.get(s.id)!;
    },
  };
}

/** One student's own counts for every subject on the list. */
export async function attendanceFor(rollNo: string): Promise<AttendanceView> {
  const today = todayISO();
  const [config, rows, plans] = await Promise.all([
    getAttendanceConfig(),
    query<Row>('SELECT subject_id, total_override, held, held_on::text AS held_on, missed FROM attendance WHERE roll_no = $1', [rollNo]),
    activePlanSummaries().catch(() => [] as PlanRecord[]),
  ]);
  const byId = new Map(rows.map((r) => [r.subject_id, r]));
  const subjects = withTitles(config.subjects, plans);
  let ctx: DueContext | null = null;
  try {
    ctx = await attendanceDueContext(subjects);
  } catch {
    ctx = null;
  }
  return {
    enabled: config.enabled,
    minPercent: config.minPercent,
    termLabel: config.termLabel,
    today,
    hasAnyRecord: subjects.some((s) => byId.has(s.id)),
    subjects: subjects.map((s) => {
      const row = byId.get(s.id);
      let nextClass: StudentSubjectView['nextClass'] = null;
      try {
        nextClass = ctx ? nextClassOf(s.code, addDays(today, -1), ctx) : null;
      } catch {
        nextClass = null;
      }
      return { id: s.id, code: s.code, title: s.title, defaultTotal: s.total, record: row ? toRecord(row) : { ...EMPTY_RECORD }, nextClass };
    }),
  };
}

async function ruleFor(subjectId: string): Promise<SubjectRule> {
  const config = await getAttendanceConfig();
  if (!config.enabled) throw new HttpError(404, 'Attendance tracking is switched off.', 'disabled');
  const rule = config.subjects.find((s) => s.id === subjectId);
  if (!rule) throw new HttpError(404, 'That subject is no longer on the attendance list.', 'not_found');
  return rule;
}

/**
 * Atomic delta: adds `delta` leaves (negative restores) so taps from two devices both count.
 * Mirrors calc.applyDelta exactly. `prev` reads (and locks) the row as it was, for heldRaised/capped:
 * the LEFT JOIN makes Postgres evaluate it before the upsert — a CTE only referenced in RETURNING
 * would run lazily after it and, with FOR UPDATE, see the new values. The lock means a concurrent
 * strike can't slip between the read and the update.
 */
const STRIKE_SQL = `
WITH prev AS MATERIALIZED (SELECT missed, held FROM attendance WHERE roll_no = $1 AND subject_id = $2 FOR UPDATE)
INSERT INTO attendance AS a (roll_no, subject_id, missed)
SELECT $1, $2, GREATEST(0, LEAST($4::int, $3::int)) FROM (SELECT 1) AS one LEFT JOIN prev ON TRUE
ON CONFLICT (roll_no, subject_id) DO UPDATE SET
  missed  = GREATEST(0, LEAST(GREATEST(a.missed, COALESCE(a.total_override, $4::int)), a.missed + $3::int)),
  updated_at = now()
RETURNING total_override, held, held_on::text AS held_on, missed,
          (SELECT missed FROM prev) AS prev_missed, (SELECT held FROM prev) AS prev_held`;

export async function strikeHearts(rollNo: string, subjectId: string, delta: number): Promise<HeartsResponse> {
  if (!Number.isInteger(delta) || delta === 0) throw new HttpError(422, 'Strike a whole number of hearts.', 'invalid');
  const rule = await ruleFor(subjectId);
  const row = await queryOne<Row & { prev_missed: number | null; prev_held: number | null }>(STRIKE_SQL, [
    rollNo,
    subjectId,
    delta,
    rule.total,
  ]);
  if (!row) throw new HttpError(500, 'Something went wrong on our side. Please try again.', 'internal');
  const record = toRecord(row);
  const prevMissed = row.prev_missed === null ? 0 : Number(row.prev_missed);
  const prevHeld = row.prev_held === null ? null : Number(row.prev_held);
  return {
    subjectId,
    record,
    // Mirrors applyDelta: the strike pushed the counted "held so far" (heldOf) past what was entered.
    heldRaised: prevHeld !== null && record.missed > Math.max(prevHeld, prevMissed),
    capped: record.missed - prevMissed !== delta,
  };
}

/** Sets a student's numbers for one subject (absolute values; only the fields given change). */
export async function updateAttendance(rollNo: string, patch: AttendancePatch): Promise<PatchResponse> {
  const rule = await ruleFor(patch.subjectId);
  const today = todayISO();
  const record = await transaction(async (tx) => {
    const { rows } = await tx.query<Row>(
      'SELECT subject_id, total_override, held, held_on::text AS held_on, missed FROM attendance WHERE roll_no = $1 AND subject_id = $2 FOR UPDATE',
      [rollNo, patch.subjectId],
    );
    const prev = rows[0] ? toRecord(rows[0]) : EMPTY_RECORD;
    const totalOverride = patch.total !== undefined ? patch.total : prev.totalOverride;
    const held = patch.held !== undefined ? patch.held : prev.held;
    const missed = patch.missed !== undefined ? patch.missed : prev.missed;
    const total = totalOverride ?? rule.total;
    const edited: EditField = patch.total !== undefined ? 'total' : patch.held !== undefined ? 'held' : 'missed';
    const problem = validateRecord(rule.code, { total, held, missed }, edited);
    if (problem) throw new HttpError(422, problem.message, 'invalid', { field: problem.field });
    // A count equal to the admin's isn't an override: later admin changes should apply.
    const override = totalOverride === rule.total ? null : totalOverride;
    const heldOn = held === null ? null : held !== prev.held ? today : prev.heldOn;
    const saved = await tx.query<Row>(
      `INSERT INTO attendance (roll_no, subject_id, total_override, held, held_on, missed, updated_at)
       VALUES ($1, $2, $3, $4, $5::date, $6, now())
       ON CONFLICT (roll_no, subject_id) DO UPDATE SET total_override = EXCLUDED.total_override, held = EXCLUDED.held,
         held_on = EXCLUDED.held_on, missed = EXCLUDED.missed, updated_at = now()
       RETURNING subject_id, total_override, held, held_on::text AS held_on, missed`,
      [rollNo, patch.subjectId, override, held, heldOn, missed],
    );
    return toRecord(saved.rows[0]!);
  });
  return { subjectId: patch.subjectId, record };
}

/* --------------------------------------------------------------- admin */

/** Aggregates only — never names or roll numbers; small cells hidden. */
export async function attendanceSummary(): Promise<AttendanceSummary> {
  const [config, rows, registered] = await Promise.all([
    getAttendanceConfig(),
    query<Row & { roll_no: string }>(
      `SELECT a.roll_no, a.subject_id, a.total_override, a.held, a.held_on::text AS held_on, a.missed FROM attendance a
       JOIN students st ON st.roll_no = a.roll_no AND st.active`,
    ),
    queryOne<{ n: number }>('SELECT count(*)::int AS n FROM students WHERE active AND pin_hash IS NOT NULL'),
  ]);
  const ids = new Set(config.subjects.map((s) => s.id));
  const mine = rows.filter((r) => ids.has(r.subject_id));
  let hearts = 0;
  const subjects = config.subjects.map((rule) => {
    hearts += standing(rule.total, null, config.minPercent).allowance;
    const counting = mine.filter((r) => r.subject_id === rule.id);
    if (counting.length < MIN_CELL) return { id: rule.id, code: rule.code, tracking: null, spent: null, over: null };
    let spent = 0;
    let over = 0;
    for (const r of counting) {
      const s = standing(rule.total, toRecord(r), config.minPercent);
      if (s.over > 0) over++;
      else if (s.left === 0 && s.allowance > 0) spent++;
    }
    return { id: rule.id, code: rule.code, tracking: counting.length, spent, over };
  });
  return {
    registered: Number(registered?.n ?? 0),
    tracking: new Set(mine.map((r) => r.roll_no)).size,
    minPercent: config.minPercent,
    enabled: config.enabled,
    hearts,
    subjects,
  };
}

/** For the home page: the term's hearts, and the signed-in student's hearts left. Never throws. */
export async function heroHearts(rollNo: string | null): Promise<{ enabled: boolean; left: number | null; hearts: number }> {
  try {
    const config = await getAttendanceConfig();
    const hearts = config.subjects.reduce((sum, s) => sum + standing(s.total, null, config.minPercent).allowance, 0);
    if (!rollNo || !config.enabled) return { enabled: config.enabled, left: null, hearts };
    const rows = await query<Row>(
      'SELECT subject_id, total_override, held, held_on::text AS held_on, missed FROM attendance WHERE roll_no = $1',
      [rollNo],
    );
    const byId = new Map(rows.map((r) => [r.subject_id, r]));
    const left = config.subjects.reduce((sum, s) => {
      const row = byId.get(s.id);
      return sum + standing(s.total, row ? toRecord(row) : null, config.minPercent).left;
    }, 0);
    return { enabled: true, left, hearts };
  } catch {
    return { enabled: false, left: null, hearts: 0 };
  }
}

/** New term: deletes every student's counts (the subjects stay). Returns how many rows went. */
export async function resetAllAttendance(): Promise<number> {
  const row = await queryOne<{ n: number }>('WITH gone AS (DELETE FROM attendance RETURNING 1) SELECT count(*)::int AS n FROM gone');
  return Number(row?.n ?? 0);
}
