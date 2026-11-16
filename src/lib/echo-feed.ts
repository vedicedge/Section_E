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

/**
 * Echo's knowledge feed: everything class-wide that Echo (Section E's study assistant on claude.ai)
 * should know, read nightly by the owner's sync task with a key. It never carries anything about an
 * individual student: no names, roll numbers, seats, attendance, results or group members.
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

export async function buildEchoFeed(today = todayISO()): Promise<EchoFeed> {
  const [quizzes, study, announcements, keyDates, homeworkRecords, ctx, groups] = await Promise.all([
    listPublishedQuizzes(),
    listStudyMaterials(),
    liveAnnouncements(today),
    listKeyDatesForAdmin(today),
    recentHomework(30),
    loadDueContext(),
    groupTopics(),
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
  };
}
