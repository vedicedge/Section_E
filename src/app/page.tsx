import Link from 'next/link';
import { Suspense } from 'react';
import { SiteHeader, timetableEnabled } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { query } from '@/lib/db';
import { getStudent } from '@/lib/session';
import { heroHearts } from '@/lib/attendance/repo';
import { countLiveQuizzes } from '@/lib/quizzes/repo';
import { openHomeworkCount } from '@/lib/homework/repo';
import { TodayInE, TodaySkeleton } from './TodayInE';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

async function stats() {
  const [[row], live, homework] = await Promise.all([
    query<{ students: number; subjects: number }>(
      `SELECT (SELECT count(*)::int FROM students WHERE active) AS students,
              (SELECT count(DISTINCT code)::int FROM seating_plans WHERE active AND kind = 'class') AS subjects`,
    ),
    countLiveQuizzes(),
    openHomeworkCount(),
  ]);
  return { students: Number(row?.students ?? 0), subjects: Number(row?.subjects ?? 0), live, homework };
}

const HOW_MANY = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'];
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Chevron() {
  return (
    <svg width="8" height="13" viewBox="0 0 8 13" aria-hidden className={styles.chev}>
      <path d="M1.5 1.5 6.5 6.5l-5 5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS = {
  seat: (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <rect x="6" y="14" width="24" height="10" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M9 24v6M27 24v6M10 14V8a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  homework: (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <rect x="7" y="5" width="22" height="27" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 13h12M12 19h12M12 25h7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  attendance: (
    <svg width="36" height="36" viewBox="0 0 24 22" aria-hidden>
      <path
        d="M12 20.5S3.2 15 1.6 9.6C.4 5.5 3.3 1.5 7.3 1.5c2.1 0 3.7 1.1 4.7 2.7 1-1.6 2.6-2.7 4.7-2.7 4 0 6.9 4 5.7 8.1C20.8 15 12 20.5 12 20.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  ),
  timetable: (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <rect x="5" y="8" width="26" height="23" rx="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5 15h26M12 4v7M24 4v7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  tests: (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M18 13v7l4.5 3M14 4h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

/** A small, nameless picture of the room for the seat tile: seats only, one of them yours. */
function MiniRoom() {
  const rows = 5;
  const cols = 11;
  return (
    <div className={styles.room} aria-hidden>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className={styles.roomRow}>
          {Array.from({ length: cols }, (_, c) => (
            <span key={c} className={`${styles.roomSeat} ${c === 5 ? styles.roomAisle : ''} ${r === 1 && c === 3 ? styles.roomMine : ''}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

interface Tool {
  key: keyof typeof ICONS;
  href: string;
  title: string;
  body: string;
  stat: string | null;
  wide?: boolean;
}

export default async function Home() {
  const studentLoad = getStudent();
  const [s, student, timetable, h] = await Promise.all([
    stats(),
    studentLoad,
    timetableEnabled(),
    studentLoad.then((st) => heroHearts(st?.rollNo ?? null)),
  ]);
  const first = student?.name.split(' ')[0];

  const tools: Tool[] = [
    {
      key: 'seat',
      href: '/seat',
      title: 'My seat',
      body: 'Your seat for every subject, on a map of the room. Only you see it, and the map shows seats, never names.',
      stat: s.subjects ? plural(s.subjects, 'subject', 'subjects') : null,
      wide: true,
    },
    {
      key: 'homework',
      href: '/homework',
      title: 'Homework',
      body: 'What’s due and when, with a reminder on your phone the evening before.',
      stat: plural(s.homework, 'open', 'open'),
    },
    ...(h.enabled
      ? [
          {
            key: 'attendance' as const,
            href: '/attendance',
            title: 'Attendance',
            body: 'Your leaves, kept as hearts. Strike one off and see how many you have left above 80%.',
            stat: student && h.left !== null ? plural(h.left, 'leave left', 'leaves left') : null,
          },
        ]
      : []),
    ...(timetable
      ? [
          {
            key: 'timetable' as const,
            href: '/timetable',
            title: 'Live timetable',
            body: 'The latest schedule, straight from the official sheet, with your seat beside every class.',
            stat: 'Live',
          },
        ]
      : []),
    {
      key: 'tests',
      href: '/tests',
      title: 'OLT mock tests',
      body: 'Timed MCQ practice before the real OLT, with your score as soon as you finish.',
      stat: s.live ? plural(s.live, 'live now', 'live now') : null,
    },
  ];
  const things = HOW_MANY[tools.length] ?? String(tools.length);

  return (
    <>
      <SiteHeader />
      <main id="main">
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className="container">
            <p className={`eyebrow ${styles.kicker}`}>{student ? `Welcome back, ${first}.` : 'PGDM 2026–28, Section E'}</p>
            <h1 id="hero-title" className={styles.headline}>
              Outside the building. Above the rest.
            </h1>
            <p className={styles.lede}>
              {student
                ? 'Your seat, your classes, your homework and your leaves, all in one place.'
                : 'Your seat, your classes, your homework and your leaves, all set to your roll number.'}
            </p>
            <div className={styles.actions}>
              {student ? (
                <Link href="/seat" className="btn btn--accent">
                  Open my seat
                </Link>
              ) : (
                <Link href="/register" className="btn btn--accent">
                  Register with your roll number
                </Link>
              )}
              {timetable ? (
                <Link href="/timetable" className="arrow-link">
                  See today’s timetable <Chevron />
                </Link>
              ) : (
                <Link href="/homework" className="arrow-link">
                  See what’s due <Chevron />
                </Link>
              )}
            </div>
            <svg className={styles.mark} viewBox="0 0 320 340" role="img" aria-label="The Section E mark: a large serif E with a hatched shadow">
              <defs>
                <pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="2.6" height="7" fill="var(--accent-fill)" />
                </pattern>
              </defs>
              <text x="174" y="318" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="420" fill="url(#hatch)">
                E
              </text>
              <text x="152" y="296" textAnchor="middle" fontFamily="Georgia, 'Times New Roman', serif" fontSize="420" fill="var(--ink)">
                E
              </text>
            </svg>
          </div>
        </section>

        {/* With the timetable off, this band only carries a student's own homework. */}
        {(timetable || student) && (
          <section className={styles.today} aria-labelledby="today-title">
            <div className="container">
              <Suspense fallback={<TodaySkeleton timetable={timetable} />}>
                <TodayInE timetable={timetable} student={student ? { rollNo: student.rollNo, name: student.name } : null} />
              </Suspense>
            </div>
          </section>
        )}

        <section className={styles.tools} aria-labelledby="tools-title">
          <div className="container">
            <h2 id="tools-title" className={styles.sectionTitle}>
              {things} things, built only for Section E.
            </h2>
            <p className={styles.sectionLede}>{student ? 'Each of them already shows what’s yours.' : 'Register once and each of them shows what’s yours.'}</p>
            <nav aria-label="Features" className={styles.grid}>
              {tools.map((t) => (
                <Link key={t.href} href={t.href} className={`${styles.tool} ${t.wide ? styles.toolWide : ''}`}>
                  <div className={styles.toolText}>
                    <span className={styles.toolIcon}>{ICONS[t.key]}</span>
                    <h3 className={styles.toolTitle}>{t.title}</h3>
                    <p className={styles.toolBody}>{t.body}</p>
                    <span className={styles.toolFoot}>
                      {t.stat && <span className={`${styles.stat} tabular`}>{t.stat}</span>}
                      <span className={styles.open}>
                        Open <Chevron />
                      </span>
                    </span>
                  </div>
                  {t.wide && <MiniRoom />}
                </Link>
              ))}
            </nav>
          </div>
        </section>

        {!student && (
          <section className={styles.how} aria-labelledby="how-title">
            <div className="container">
              <h2 id="how-title" className={styles.sectionTitle}>
                Set up in under a minute.
              </h2>
              <ol className={styles.steps}>
                <li>
                  <span className={styles.stepNum}>Step 1</span>
                  <span className={styles.stepTitle}>Enter your roll number</span>
                  <span className={styles.stepBody}>It’s checked against the Section E roster.</span>
                </li>
                <li>
                  <span className={styles.stepNum}>Step 2</span>
                  <span className={styles.stepTitle}>Choose a 4-digit PIN</span>
                  <span className={styles.stepBody}>So nobody else can open your seat or your test results.</span>
                </li>
                <li>
                  <span className={styles.stepNum}>Step 3</span>
                  <span className={styles.stepTitle}>You’re in</span>
                  <span className={styles.stepBody}>This device remembers you. Forgot your PIN? The admin can reset it.</span>
                </li>
              </ol>
            </div>
          </section>
        )}

        <section className={styles.claim} aria-labelledby="claim-title">
          <div className="container">
            {student ? (
              <>
                <h2 id="claim-title" className={styles.claimTitle}>
                  {s.students ? `${s.students} of us.` : 'All of us.'} One building of our own.
                </h2>
                <p className={styles.claimBody}>Only you see your seat, your homework ticks and your leaves. Nothing here is shared with other sections.</p>
              </>
            ) : (
              <>
                <h2 id="claim-title" className={styles.claimTitle}>
                  Claim your roll number once. Every page after that is yours.
                </h2>
                <Link href="/register" className="btn btn--accent">
                  Register with your roll number
                </Link>
                <p className={styles.claimBody}>Only you see your seat, your homework ticks and your leaves. Nothing here is shared with other sections.</p>
              </>
            )}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
