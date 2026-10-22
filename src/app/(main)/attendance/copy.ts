import {
  formatPercent,
  requiredOf,
  smallWord,
  type BoardTotals,
  type SubjectStanding,
} from '@/lib/attendance/calc';
import { addDays, formatClock, formatDay, weekdayOf } from '@/lib/time';
import type { HeartState } from './Heart';

/**
 * Every sentence the Attendance board says, as pure functions (unit-tested in
 * tests/unit/attendance-copy.test.ts). The voice is the site's: plain, a little dry, never a scold.
 */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
  'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** 0–99 spelled out and capitalised ('Twenty-three'); 100 and above as digits. */
export function countWord(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return cap(ONES[n]!);
  const tens = TENS[Math.floor(n / 10)]!;
  return cap(n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]}`);
}

/** Two-digit counts for the "(04)" superscripts. */
export const pad2 = (n: number) => String(n).padStart(2, '0');

/** '2026-10-14' → '14 Oct' */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m! - 1]}`;
}

/** 'today, 10:30 am' | 'tomorrow, 10:30 am' | 'Thu 23 Oct, 10:30 am' (no time → no clause). */
export function whenLabel(date: string, time: string | null, today: string): string {
  const clock = time ? `, ${formatClock(time)}` : '';
  if (date === today) return `today${clock}`;
  if (date === addDays(today, 1)) return `tomorrow${clock}`;
  return `${weekdayOf(date)} ${shortDate(date)}${clock}`;
}

/** 'CF', 'CF and SM', 'CF, OM and SM' */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/* ---------------------------------------------------------- status plate */

export type PlateCopy = {
  tone: 'red' | 'quiet';
  label: string;
  /** before, emphasised, after */
  title: [string, string, string];
  text: string | null;
  rows: { id: string; code: string; sentence: string }[];
};

export interface PlateSubject {
  id: string;
  code: string;
  standing: SubjectStanding;
  nextClass: { date: string; time: string | null } | null;
}

/** The short sentence beside an at-risk subject on the red plate. */
export function rowSentence(s: SubjectStanding, minPercent: number): string {
  if (s.over > 0) return `${s.over} over the line — below ${formatPercent(minPercent)}%`;
  if (s.left === 0) return 'none left — attend every class';
  return 'one heart left';
}

export function plateCopy(input: {
  subjects: PlateSubject[];
  board: BoardTotals;
  hasAnyRecord: boolean;
  minPercent: number;
  today: string;
}): PlateCopy {
  const { subjects, board, hasAnyRecord, minPercent, today } = input;
  const pct = formatPercent(minPercent);
  const byId = new Map(subjects.map((s) => [s.id, s]));
  const atRisk = board.atRiskIds.map((id) => byId.get(id)).filter((s): s is PlateSubject => Boolean(s));
  const rows = atRisk.map((s) => ({ id: s.id, code: s.code, sentence: rowSentence(s.standing, minPercent) }));

  if (board.overIds.length > 0) {
    const over = board.overIds.map((id) => byId.get(id)).filter((s): s is PlateSubject => Boolean(s));
    if (over.length === 1) {
      const { code, standing: s } = over[0]!;
      const allows = s.allowance === 0 ? 'none' : String(s.allowance);
      return {
        tone: 'red',
        label: 'In the red',
        title: ['Below the line in ', code, '.'],
        text: `You’ve missed ${s.missed} ${code} ${s.missed === 1 ? 'class' : 'classes'}; at ${pct}% the term allows ${allows}. Talk to the faculty or your CR — sooner is kinder.`,
        rows,
      };
    }
    return {
      tone: 'red',
      label: 'In the red',
      title: ['Below the line in ', `${smallWord(over.length)} subjects`, '.'],
      text: `You’re below ${pct}% in ${listOf(over.map((s) => s.code))}. Talk to the faculty or your CR — sooner is kinder.`,
      rows,
    };
  }

  if (atRisk.length > 0) {
    const first = atRisk[0]!;
    let title: PlateCopy['title'];
    if (atRisk.length > 1) title = [`${countWord(atRisk.length)} subjects need `, 'care', '.'];
    else if (first.standing.condition === 'fragile') title = ['', first.code, ' is down to its last heart.'];
    else title = ['No hearts left in ', first.code, '.'];
    const withClass = atRisk.find((s) => s.nextClass);
    return {
      tone: 'red',
      label: 'Mind the line',
      title,
      text: withClass?.nextClass
        ? `Next ${withClass.code} class: ${whenLabel(withClass.nextClass.date, withClass.nextClass.time, today)}.`
        : null,
      rows,
    };
  }

  if (!hasAnyRecord) {
    return {
      tone: 'quiet',
      label: `${formatDay(today)} · a fresh term`,
      title: [`${board.hearts} hearts, `, 'untouched', '.'],
      text: 'Already missed a few? Tap a heart once for each leave — or use “Adjust numbers” to enter them in one go.',
      rows: [],
    };
  }

  const untouched = board.untouchedIds.map((id) => byId.get(id)?.code).filter((c): c is string => Boolean(c));
  const withHearts = subjects.filter((s) => s.standing.allowance > 0).length;
  const clause = untouched.length > 0 && untouched.length < withHearts ? ` Untouched so far: ${listOf(untouched)}.` : '';
  return {
    tone: 'quiet',
    label: 'Your standing',
    title: ['All in good ', 'standing', '.'],
    text: `${board.left} of ${board.hearts} hearts in hand.${clause}`,
    rows: [],
  };
}

/* ----------------------------------------------------------------- hearts */

/** The accessible name of each heart button. `i` and `n` are 1-based (for over hearts, `i` is k). */
export function heartLabel(code: string, state: HeartState, i: number, n: number): string {
  switch (state) {
    case 'intact':
      return `${code} heart ${i} of ${n}: intact. Press to strike off a leave.`;
    case 'spent':
      return `${code} heart ${i} of ${n}: struck off. Press to restore the latest leave.`;
    case 'over':
      return `${code} leave ${i} over the limit. Press to remove it.`;
    case 'ghost':
      return `Mark another ${code} leave, past the limit`;
  }
}

/** The polite live-region line after every change. */
export function liveCopy(code: string, s: SubjectStanding): string {
  if (s.over > 0) return `${code}: ${s.over} over the limit.`;
  return `${code}: ${s.left} of ${s.allowance} ${s.allowance === 1 ? 'heart' : 'hearts'} left.`;
}

export type ToastKind = 'strike' | 'mend' | 'over' | 'unover' | 'saved' | 'held' | 'full';

/**
 * "a" or "an" before a subject code. Codes are read letter by letter ("an SM", "an OM", "a DMA"),
 * so the article follows the first letter's spoken name.
 */
export function a(code: string): string {
  const c = code.trim();
  const first = c.charAt(0).toUpperCase();
  const initialism = c === c.toUpperCase();
  const an = initialism ? 'AEFHILMNORSX'.includes(first) : 'AEIOU'.includes(first);
  return `${an ? 'an' : 'a'} ${code}`;
}

/**
 * Toast lines. `extra`: minPercent for 'over' and 'unover'; the new "held so far" for 'held'.
 * 'unover' is a mend that removes a leave past the limit; 'full' is a strike with every session already marked.
 */
export function toastCopy(kind: ToastKind, code: string, s: SubjectStanding, extra?: number): string {
  const pct = formatPercent(extra ?? 80);
  switch (kind) {
    case 'strike':
      return s.left === 0
        ? `Struck ${code}’s last heart — attend every ${code} class from here.`
        : `Struck ${a(code)} heart — ${s.left} left.`;
    case 'mend':
      return `Restored ${a(code)} heart — ${s.left} left.`;
    case 'over':
      return `Marked ${a(code)} leave past the limit — you’re below ${pct}% in ${code}.`;
    case 'unover':
      return s.over > 0
        ? `Removed ${a(code)} leave past the limit — still ${s.over} over.`
        : `Removed ${a(code)} leave past the limit — you’re back on the line.`;
    case 'saved':
      return `${code} numbers saved.`;
    case 'held':
      return ` Held so far raised to ${extra} to match.`;
    case 'full':
      return `Every ${code} session is already marked missed — check your total.`;
  }
}

/** What went wrong with a save, for the toast. `error` is the API's own message. */
export function errorCopy(status: number, error: string): string {
  if (status === 429) return 'You’re updating very fast — give it a moment.';
  if (status === 404) return 'That subject just changed — reloading…';
  if (status === 401) return 'Your session has ended.';
  return `Not saved — ${error} Your hearts are back as they were.`;
}

/* ----------------------------------------------------------------- method */

/**
 * The colophon's worked example: "80% of 14 sessions is 11.2, so you must attend 12 — that leaves
 * 2 hearts, not 3." The "not 3" clause only appears when rounding actually costs a heart.
 */
export function methodCopy(minPercent: number, sessions = 14): string {
  const pct = formatPercent(minPercent);
  const required = Math.min(sessions, requiredOf(sessions, minPercent));
  const hearts = sessions - required;
  const exact = (sessions * Math.round(minPercent * 100)) / 10_000;
  const rounded = !Number.isInteger(exact);
  const plural = (n: number) => `${n} ${n === 1 ? 'heart' : 'hearts'}`;
  const raw = rounded ? String(Math.round(exact * 100) / 100) : String(exact);
  return (
    `Hearts are the classes you can miss and still reach ${pct}%. ${pct}% of ${sessions} sessions is ${raw}, ` +
    `so you must attend ${required} — that leaves ${plural(hearts)}${rounded ? `, not ${sessions - Math.floor(exact)}` : ''}. ` +
    'Attendance rounds up; leave never does.'
  );
}

/** "Attend 16 of 20 · on course for 95%" */
export function attendNote(s: SubjectStanding): string {
  return `Attend ${s.required} of ${s.total} · on course for ${formatPercent(s.bestPercent)}%`;
}

/** "Attended 11 of 12 held so far — 91.7% · as of 14 Oct" (null when there's nothing to say). */
export function heldNote(held: number | null, heldOn: string | null, s: SubjectStanding): string | null {
  if (held === null || held <= 0 || s.currentPercent === null) return null;
  const asOf = heldOn ? ` · as of ${shortDate(heldOn)}` : '';
  return `Attended ${held - s.missed} of ${held} held so far — ${formatPercent(s.currentPercent)}%${asOf}`;
}

/** The editor's live preview: "With 22 sessions: attend 18 · 4 hearts · 1 left." */
export function previewCopy(s: SubjectStanding): string {
  const hearts = `${s.allowance} ${s.allowance === 1 ? 'heart' : 'hearts'}`;
  const tail = s.over > 0 ? `${s.over} over the line` : `${s.left} left`;
  return `With ${s.total} sessions: attend ${s.required} · ${hearts} · ${tail}.`;
}
