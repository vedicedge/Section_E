import 'server-only';
import { safeEqual, sha256 } from './crypto';
import { query } from './db';
import { getSetting, setSetting } from './settings';
import { addDays, todayISO } from './time';
import { listPublishedQuizzes } from './quizzes/repo';
import { listStudyMaterials } from './study';
import { liveAnnouncements } from './announcements';
import { listKeyDatesForAdmin } from './key-dates';
import { loadDueContext, recentHomework, resolveAll } from './homework/repo';
import { activePlanSummaries, planStatus, type LayoutRow } from './seating/repo';
import { upcomingSchedule } from './schedule';
import { timetableForEcho, type EchoTimetableDay } from './echo-timetable';

/**
 * Echo's knowledge feed: everything class-wide that Echo (Section E's study assistant on claude.ai)
 * should know, read nightly by the owner's sync task with a key. It never carries names, attendance,
 * results or group members. The one per-student item is seating: roll number -> row and seat for each
 * current or upcoming plan (no names), so Echo can answer "where do I sit in CF?" when a student gives
 * their roll number. The owner chose this on 16 Nov 2026.
 */

const SETTING_KEY = 'echo.feed';

interface FeedSetting {
  keyHash: string | null;
  lastPull: string | null;
}

async function readSetting(): Promise<FeedSetting> {
  const saved = await getSetting<Partial<FeedSetting>>(SETTING_KEY);
  return { keyHash: saved?.keyHash ?? null, lastPull: saved?.lastPull ?? null };
}

/** Creates a new feed key (the old one stops working), stores only its hash, and returns it once. */
export async function rotateEchoKey(): Promise<string> {
  const key = `echo_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await setSetting(SETTING_KEY, { keyHash: sha256(key), lastPull: null } satisfies FeedSetting);
  return key;
}

export async function verifyEchoKey(presented: string | null): Promise<boolean> {
  if (!presented) return false;
  const { keyHash } = await readSetting();
  return Boolean(keyHash && safeEqual(sha256(presented), keyHash));
}

export async function echoFeedStatus() {
  const s = await readSetting();
  return { hasKey: Boolean(s.keyHash), lastPull: s.lastPull };
}

export async function markPulled() {
  await setSetting(SETTING_KEY, { ...(await readSetting()), lastPull: new Date().toISOString() });
}

export interface EchoFeed {
  generatedAt: string;
  today: string;
  quizzes: { title: string; subject: string | null; questions: number; durationMinutes: number | null; opensAt: string | null; closesAt: string | null; status: string; answers: string }[];
  studyMaterials: { subject: string | null; title: string; url: string; addedAt: string }[];
  announcements: { title: string; body: string; link: string | null; postedAt: string; showsUntil: string | null }[];
  keyDates: { kind: string; subject: string | null; title: string; date: string; time: string | null; details: string }[];
  homework: { subject: string; title: string; details: string; givenOn: string; due: string | null; dueTime: string | null }[];
  groups: { subject: string; title: string; groups: { name: string; topic: string | null; size: number }[] }[];
  /** The next two weeks of classes from the live timetable ("unavailable" when it is off or can't be read). */
  timetable: { status: 'ok' | 'stale' | 'unavailable'; checkedAt: string | null; days: EchoTimetableDay[] };
  seating: {
    code: string;
    title: string;
    kind: 'class' | 'exam';
    room: string | null;
    aliases: string[];
    validFrom: string | null;
    validTo: string | null;
    status: 'current' | 'upcoming';
    /** Room shape, front row first: each row's label and how many seats it has. */
    rows: { label: string; seats: number }[];
    /** Roll number -> seat. No names. */
    seats: { rollNo: string; row: string; seat: number; seatsInRow: number }[];
  }[];
}

/** Group lists by subject: each group's name, topic and size only (members are never included). */
async function groupTopics(): Promise<EchoFeed['groups']> {
  const rows = await query<{ subject: string; title: string; group_name: string; topic: string | null; size: number }>(
    `SELECT s.subject, s.title, m.group_name, max(m.topic) AS topic, count(*)::int AS size
       FROM group_sets s JOIN group_members m ON m.set_id = s.id
      GROUP BY s.subject, s.title, m.group_name
      ORDER BY s.subject, s.title`,
  );
  const sets = new Map<string, EchoFeed['groups'][number]>();
  for (const r of rows) {
    const key = `${r.subject}\u0000${r.title}`;
    if (!sets.has(key)) sets.set(key, { subject: r.subject, title: r.title, groups: [] });
    sets.get(key)!.groups.push({ name: r.group_name, topic: r.topic, size: Number(r.size) });
  }
  for (const s of sets.values()) s.groups.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return [...sets.values()];
}

/** The next 14 days of the class timetable. A timetable that is off or unreadable must not fail the feed. */
async function timetable(): Promise<EchoFeed['timetable']> {
  try {
    const { state, days } = await upcomingSchedule(14);
    if (state.status !== 'ok' && state.status !== 'stale') return { status: 'unavailable', checkedAt: null, days: [] };
    return { status: state.status, checkedAt: state.checkedAt, days: timetableForEcho(days) };
  } catch {
    return { status: 'unavailable', checkedAt: null, days: [] };
  }
}

/** Current and upcoming seating plans: roll number -> row and seat, never names or notes. */
async function seating(today: string): Promise<EchoFeed['seating']> {
  const plans = (await activePlanSummaries()).filter((p) => planStatus(p, today) !== 'expired');
  if (!plans.length) return [];
  const rows = await query<{ plan_id: string; roll_no: string; row_label: string | null; row_index: number | null; seat_number: number | null }>(
    `SELECT plan_id, roll_no, row_label, row_index, seat_number FROM seat_assignments
      WHERE plan_id = ANY($1) AND seat_number IS NOT NULL ORDER BY plan_id, row_index, seat_number`,
    [plans.map((p) => p.id)],
  );
  const rowSize = (layout: LayoutRow[], i: number | null) => (i === null ? 0 : (layout[i]?.seats.length ?? 0));
  return plans.map((p) => ({
    code: p.code,
    title: p.title,
    kind: p.kind,
    room: p.room,
    aliases: p.aliases,
    validFrom: p.validFrom,
    validTo: p.validTo,
    status: planStatus(p, today) as 'current' | 'upcoming',
    rows: p.layout.map((r) => ({ label: r.label, seats: r.seats.length })),
    seats: rows
      .filter((r) => r.plan_id === p.id)
      .map((r) => ({
        rollNo: r.roll_no,
        row: r.row_label ?? p.layout[Number(r.row_index)]?.label ?? '',
        seat: Number(r.seat_number),
        seatsInRow: rowSize(p.layout, r.row_index === null ? null : Number(r.row_index)),
      })),
  }));
}

export async function buildEchoFeed(today = todayISO()): Promise<EchoFeed> {
  const [quizzes, study, announcements, keyDates, homeworkRecords, ctx, groups, seats, classes] = await Promise.all([
    listPublishedQuizzes(),
    listStudyMaterials(),
    liveAnnouncements(today),
    listKeyDatesForAdmin(today),
    recentHomework(30),
    loadDueContext(),
    groupTopics(),
    seating(today),
    timetable(),
  ]);
  const homework = await resolveAll(homeworkRecords, ctx, today);
  return {
    generatedAt: new Date().toISOString(),
    today,
    quizzes: quizzes.map((q) => ({
      title: q.title,
      subject: q.subject,
      questions: q.questionCount,
      durationMinutes: q.durationMinutes,
      opensAt: q.opensAt,
      closesAt: q.closesAt,
      status: q.phase,
      answers: q.showAnswers,
    })),
    studyMaterials: study.map((m) => ({ subject: m.subject, title: m.title, url: m.url, addedAt: m.addedAt })),
    announcements: announcements.map((a) => ({ title: a.title, body: a.body, link: a.link, postedAt: a.createdAt, showsUntil: a.expiresOn })),
    keyDates: keyDates.map((d) => ({ kind: d.kind, subject: d.subject, title: d.title, date: d.onDate, time: d.atTime, details: d.details })),
    homework: homework
      .filter((h) => !h.due.date || h.due.date >= addDays(today, -7))
      .map((h) => ({ subject: h.subjectTitle || h.subjectCode, title: h.title, details: h.details, givenOn: h.givenOn, due: h.due.date, dueTime: h.due.time })),
    groups,
    timetable: classes,
    seating: seats,
  };
}
