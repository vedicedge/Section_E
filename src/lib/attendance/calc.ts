import { subjectKey } from '../names';

/**
 * Attendance arithmetic. Each subject has a number of sessions in the term and a minimum share a
 * student must attend (80% by default). The classes they may miss are their "hearts".
 * Pure functions — safe on server and client, unit-tested.
 */

export const DEFAULT_MIN_PERCENT = 80;
export const MAX_SESSIONS = 200;
/** Above this many hearts in one subject, the board draws a count instead of hearts. */
export const MAX_DRAWN_HEARTS = 40;
/** Over-the-limit hearts drawn before "+N". */
export const MAX_DRAWN_OVER = 10;
export const UNDO_MS = 6000;
export const DEBOUNCE_MS = 350;

/* -------------------------------------------------------------- config */

export interface SubjectRule {
  /** Stable: subjectKey(code) when first created; never changes on a rename, so students' counts follow. */
  id: string;
  /** Display code, e.g. 'MM II'. */
  code: string;
  /** '' → borrowed from the matching class seating plan at read time. */
  title: string;
  /** Sessions in the term, as set by the admin (1..200). */
  total: number;
  /** Extra labels for seating-plan / timetable matching (≤ 6). */
  aliases: string[];
}

export interface AttendanceConfig {
  enabled: boolean;
  /** Minimum attendance, in percent (50..100). */
  minPercent: number;
  termLabel: string;
  /** Admin order. */
  subjects: SubjectRule[];
}

const MAX_SUBJECTS = 30;
const MAX_ALIASES = 6;
const MAX_TERM_LABEL = 40;

function rule(code: string, total: number): SubjectRule {
  return { id: subjectKey(code), code, title: '', total, aliases: [] };
}

/** The term's subjects and sessions (course facts only). */
export const DEFAULT_CONFIG: AttendanceConfig = {
  enabled: true,
  minPercent: DEFAULT_MIN_PERCENT,
  termLabel: 'Term II',
  subjects: [rule('DMA', 20), rule('DT', 10), rule('CF', 20), rule('OM', 20), rule('MM II', 15), rule('TOD', 14), rule('SM', 20)],
};

function cloneConfig(c: AttendanceConfig): AttendanceConfig {
  return { ...c, subjects: c.subjects.map((s) => ({ ...s, aliases: [...s.aliases] })) };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Reads a stored config defensively: fills defaults, ids and aliases; drops malformed subjects. */
export function normaliseConfig(raw: unknown): AttendanceConfig {
  if (!isRecord(raw)) return cloneConfig(DEFAULT_CONFIG);
  const minPercent =
    typeof raw.minPercent === 'number' && Number.isFinite(raw.minPercent) && raw.minPercent >= 50 && raw.minPercent <= 100
      ? raw.minPercent
      : DEFAULT_MIN_PERCENT;
  const termLabel = typeof raw.termLabel === 'string' ? raw.termLabel.trim().slice(0, MAX_TERM_LABEL) : DEFAULT_CONFIG.termLabel;
  const subjects: SubjectRule[] = [];
  if (Array.isArray(raw.subjects)) {
    for (const s of raw.subjects) {
      if (!isRecord(s) || typeof s.code !== 'string') continue;
      const code = s.code.trim();
      const total = Number(s.total);
      if (!code || !Number.isInteger(total) || total < 1 || total > MAX_SESSIONS) continue;
      const id = (typeof s.id === 'string' && s.id) || subjectKey(code);
      if (!id) continue;
      const aliases = Array.isArray(s.aliases)
        ? s.aliases.filter((a): a is string => typeof a === 'string' && a.trim() !== '').map((a) => a.trim()).slice(0, MAX_ALIASES)
        : [];
      subjects.push({ id, code, title: typeof s.title === 'string' ? s.title.trim() : '', total, aliases });
      if (subjects.length === MAX_SUBJECTS) break;
    }
  }
  return {
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    minPercent,
    termLabel,
    subjects: Array.isArray(raw.subjects) ? subjects : cloneConfig(DEFAULT_CONFIG).subjects,
  };
}

/** Every matching key of a subject (its code and aliases), de-duplicated, never empty strings. */
export function configKeys(s: Pick<SubjectRule, 'code' | 'aliases'>): string[] {
  return [...new Set([s.code, ...s.aliases].map(subjectKey).filter(Boolean))];
}

/* ------------------------------------------------------------ standing */

export interface SubjectRecord {
  /** The student's own count of sessions, when it differs from the admin's. */
  totalOverride: number | null;
  /** Classes held so far (optional), for a current percentage. */
  held: number | null;
  /** When `held` was last set ('YYYY-MM-DD'). */
  heldOn: string | null;
  /** Leaves taken (raw; never clamped, so an admin lowering the total can't rewrite it). */
  missed: number;
}

export const EMPTY_RECORD: SubjectRecord = { totalOverride: null, held: null, heldOn: null, missed: 0 };

export type Condition = 'mint' | 'fine' | 'fair' | 'fragile' | 'spent' | 'no-reserve' | 'in-the-red';

export interface SubjectStanding {
  total: number;
  /** Classes that must be attended. */
  required: number;
  /** Classes that may be missed — the hearts. */
  allowance: number;
  missed: number;
  /** Hearts still intact (never negative). */
  left: number;
  /** Leaves beyond the allowance. */
  over: number;
  /** More leaves logged than the subject has sessions (e.g. the admin lowered the total). */
  inconsistent: boolean;
  /** Attendance at the end of term if no more classes are missed. */
  bestPercent: number;
  /** Attendance so far, when the student entered how many classes have been held. */
  currentPercent: number | null;
  condition: Condition;
}

/** Classes to attend: the smallest whole number that reaches the minimum (80% of 14 → 12). */
export function requiredOf(total: number, minPercent: number): number {
  // Integer arithmetic, so 80% of 20 is exactly 16 and not 16.000000000000004 → 17.
  return Math.ceil((total * Math.round(minPercent * 100)) / 10_000);
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/**
 * "Held so far" as counted: never fewer than the leaves logged, since every leave is a class that
 * was held. Derived rather than stored, so undoing a strike also undoes the raise.
 */
export function heldOf(record: Pick<SubjectRecord, 'held' | 'missed'> | null): number | null {
  return record && record.held !== null ? Math.max(record.held, record.missed) : null;
}

export function standing(defaultTotal: number, record: SubjectRecord | null, minPercent: number): SubjectStanding {
  const total = clampInt(record?.totalOverride ?? defaultTotal, 1, MAX_SESSIONS);
  const required = Math.min(total, requiredOf(total, minPercent));
  const allowance = total - required;
  const missed = record?.missed ?? 0;
  const left = Math.max(0, allowance - missed);
  const over = Math.max(0, missed - allowance);
  const held = heldOf(record);
  const currentPercent = held !== null && held > 0 ? Math.max(0, ((held - missed) / held) * 100) : null;
  const bestPercent = Math.max(0, ((total - missed) / total) * 100);
  let condition: Condition;
  if (over > 0) condition = 'in-the-red';
  else if (allowance === 0) condition = 'no-reserve';
  else if (left === 0) condition = 'spent';
  else if (missed === 0) condition = 'mint';
  else if (left === 1) condition = 'fragile';
  else if (left / allowance <= 0.5) condition = 'fair';
  else condition = 'fine';
  return { total, required, allowance, missed, left, over, inconsistent: missed > total, bestPercent, currentPercent, condition };
}

/**
 * Adds `delta` leaves (negative to restore). Mirrors the SQL in strikeHearts exactly; the client
 * uses it for optimistic state. A strike never lowers an inconsistent count and the count never
 * goes below 0 or past the total. `heldRaised` says the strike pushed the counted "held so far"
 * (see heldOf) past what was entered.
 */
export function applyDelta(
  record: SubjectRecord,
  delta: number,
  defaultTotal: number,
): { record: SubjectRecord; heldRaised: boolean; capped: boolean } {
  const total = record.totalOverride ?? defaultTotal;
  const missed = Math.max(0, Math.min(Math.max(record.missed, total), record.missed + delta));
  const heldRaised = record.held !== null && missed > Math.max(record.held, record.missed);
  return { record: { ...record, missed }, heldRaised, capped: missed - record.missed !== delta };
}

export type EditField = 'total' | 'held' | 'missed';

/** First problem with a student's numbers, worded for the field it belongs to; null when valid. */
export function validateRecord(
  code: string,
  next: { total: number; held: number | null; missed: number },
  edited?: EditField,
): { field: EditField; message: string } | null {
  const { total, held, missed } = next;
  if (missed > total) {
    return edited === 'total'
      ? { field: 'total', message: `${code} can’t have fewer sessions (${total}) than the leaves you’ve logged (${missed}).` }
      : { field: 'missed', message: `Leaves can’t be more than the ${total} sessions.` };
  }
  if (held !== null && held > total) return { field: 'held', message: `Held so far can’t be more than the ${total} sessions.` };
  // Only when "held so far" itself is being set: otherwise it simply counts up with the leaves (heldOf).
  if (held !== null && missed > held && edited === 'held') {
    return { field: 'held', message: `You’ve logged ${missed} leaves but only ${held} classes held — raise “held so far” or lower your leaves.` };
  }
  return null;
}

/* ---------------------------------------------------------------- copy */

const CONDITION_LABELS: Record<Condition, string> = {
  mint: 'Mint',
  fine: 'Fine',
  fair: 'Fair',
  fragile: 'Fragile',
  spent: 'Spent',
  'no-reserve': 'No reserve',
  'in-the-red': 'In the red',
};

export function conditionLabel(c: Condition): string {
  return CONDITION_LABELS[c];
}

const SMALL = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

/** 0..10 as words ('none', 'one' … 'ten'); anything else as digits. */
export function smallWord(n: number, capital = false): string {
  const word = Number.isInteger(n) && n >= 0 && n <= 10 ? SMALL[n]! : String(n);
  return capital ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

/** One line for each condition, in the site's voice. */
export function conditionLine(code: string, s: SubjectStanding, minPercent: number): string {
  const pct = formatPercent(minPercent);
  switch (s.condition) {
    case 'mint':
      if (s.allowance === 1) return 'Its one heart, intact.';
      if (s.allowance === 2) return 'Both hearts intact.';
      return `All ${smallWord(s.allowance)} hearts intact.`;
    case 'fine':
      return `${smallWord(s.left, true)} in hand. Spend them wisely.`;
    case 'fair':
      return `${smallWord(s.left, true)} left — keep one for a rainy day.`;
    case 'fragile':
      return 'One heart left. Handle with care.';
    case 'spent':
      return `No hearts left. Attend every remaining ${code} class.`;
    case 'no-reserve':
      return `At ${pct}%, every ${code} class counts — there’s no leave to spare.`;
    case 'in-the-red':
      return `${smallWord(s.over, true)} over the line. You’re below ${pct}% in ${code} — talk to the faculty or your CR.`;
  }
}

/** Formats a percentage without false precision: 80, 87.5, 93.3. */
export function formatPercent(p: number): string {
  const rounded = Math.round(p * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/* --------------------------------------------------------------- board */

export interface BoardTotals {
  hearts: number;
  left: number;
  spent: number;
  over: number;
  overIds: string[];
  /** Fragile, spent or in the red — in config order. */
  atRiskIds: string[];
  untouchedIds: string[];
}

const AT_RISK = new Set<Condition>(['fragile', 'spent', 'in-the-red']);

export function boardOf(subjects: { id: string; standing: SubjectStanding }[]): BoardTotals {
  const board: BoardTotals = { hearts: 0, left: 0, spent: 0, over: 0, overIds: [], atRiskIds: [], untouchedIds: [] };
  for (const { id, standing: s } of subjects) {
    board.hearts += s.allowance;
    board.left += s.left;
    board.spent += Math.min(s.missed, s.allowance);
    board.over += s.over;
    if (s.over > 0) board.overIds.push(id);
    if (AT_RISK.has(s.condition)) board.atRiskIds.push(id);
    if (s.missed === 0 && s.allowance > 0) board.untouchedIds.push(id);
  }
  return board;
}

/** The heart outline, in a 48×44 viewBox (cleft at 24,9; tip at 24,42). */
export const HEART_PATH = 'M24 42 C10 32 2 24 2 14 C2 7 7 2 13.5 2 C18 2 22 5 24 9 C26 5 30 2 34.5 2 C41 2 46 7 46 14 C46 24 38 32 24 42 Z';

/* ------------------------------------------------------- API payloads */

export interface HeartsResponse {
  subjectId: string;
  record: SubjectRecord;
  heldRaised: boolean;
  capped: boolean;
}

export interface PatchResponse {
  subjectId: string;
  record: SubjectRecord;
}
