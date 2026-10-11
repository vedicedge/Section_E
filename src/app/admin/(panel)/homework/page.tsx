import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { isClassHappening, nextClassOf, type DueContext } from '@/lib/homework/due';
import { whatsappText } from '@/lib/homework/messages';
import { homeworkDueOn, homeworkForAdmin, homeworkSubjects, loadDueContext, type SubjectOption } from '@/lib/homework/repo';
import { subjectKey } from '@/lib/names';
import { lastReminder } from '@/lib/notify';
import { pushConfigured, subscriptionStats } from '@/lib/push';
import { isAdmin } from '@/lib/session';
import { rosterSize } from '@/lib/students';
import { addDays, formatDateTime, todayISO, toMinutes, weekdayOf } from '@/lib/time';
import { HomeworkBoard } from './HomeworkBoard';
import { HomeworkTable } from './HomeworkTable';
import { ReminderPanel } from './ReminderPanel';
import type { BoardSubject } from './shared';
import styles from '../../admin.module.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Homework · Admin' };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function pickDate(raw: string | string[] | undefined, fallback: string): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) return fallback;
  return addDays(value, 0) === value ? value : fallback;
}

/** Subjects for the board: the ones that met on `givenOn` first (by class time), each with its next class. */
function boardSubjects(subjects: SubjectOption[], ctx: DueContext | null, givenOn: string): BoardSubject[] {
  const dated = ctx?.sessions.some((s) => s.date) ?? false;
  const day = weekdayOf(givenOn);
  const rows = subjects.map((subject) => {
    const key = subjectKey(subject.code);
    const met = ctx
      ? ctx.sessions
          .filter((s) => isClassHappening(s) && (dated ? s.date === givenOn : s.day === day) && subjectKey(ctx.subjectOf(s) ?? '') === key)
          .sort((a, b) => (toMinutes(a.start) ?? 9999) - (toMinutes(b.start) ?? 9999))
      : [];
    return {
      code: subject.code,
      title: subject.title,
      classToday: met.length ? { time: met[0]!.start } : null,
      next: ctx ? nextClassOf(subject.code, givenOn, ctx) : null,
    };
  });
  const met = rows.filter((r) => r.classToday).sort((a, b) => (toMinutes(a.classToday!.time) ?? 9999) - (toMinutes(b.classToday!.time) ?? 9999));
  return [...met, ...rows.filter((r) => !r.classToday)];
}

async function siteUrl(): Promise<string | null> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = (h.get('x-forwarded-host') ?? h.get('host'))?.split(',')[0]?.trim();
  if (!host) return null;
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  const proto = h.get('x-forwarded-proto')?.split(',')[0]?.trim() || (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

export default async function AdminHomework({ searchParams }: Props) {
  // The panel layout isn't re-run on client navigation, so guard the data here too.
  if (!(await isAdmin())) redirect('/admin/login');
  const today = todayISO();
  const givenOn = pickDate((await searchParams).date, today);
  const tomorrow = addDays(today, 1);

  const [subjects, ctx, items, roster, stats, last, dueTomorrow, url] = await Promise.all([
    homeworkSubjects(),
    loadDueContext(),
    homeworkForAdmin(),
    rosterSize(),
    subscriptionStats(),
    lastReminder(),
    homeworkDueOn(tomorrow),
    siteUrl(),
  ]);
  const open = items.filter((i) => i.bucket !== 'past').length;
  const configured = pushConfigured();

  return (
    <div className={styles.stack}>
      <header className={styles.pageHead}>
        <div>
          <p className="eyebrow">Admin</p>
          <h1 className={styles.title}>
            Homework<span className="count">({String(open).padStart(2, '0')})</span>
          </h1>
          <p className={styles.lede}>
            At the end of each day, write what was set against each subject. “Next class” deadlines follow the live timetable — if the class moves, the
            deadline moves with it. Students see it on their Homework page and get a reminder the evening before it is due.
          </p>
        </div>
      </header>

      <HomeworkBoard
        givenOn={givenOn}
        today={today}
        subjects={boardSubjects(subjects, ctx, givenOn)}
        timetable={ctx !== null}
        pushReady={configured}
      />

      <HomeworkTable items={items} roster={roster} today={today} subjects={subjects} />

      <ReminderPanel
        configured={configured}
        cronReady={Boolean(env.cronSecret)}
        stats={stats}
        last={last ? { when: formatDateTime(last.sentAt), recipients: last.recipients } : null}
        share={{ date: tomorrow, count: dueTomorrow.length, text: dueTomorrow.length ? whatsappText(dueTomorrow, tomorrow, today, url) : null }}
      />
    </div>
  );
}
