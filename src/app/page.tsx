import Link from 'next/link';
import { Suspense } from 'react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Crown, Pavilion } from '@/components/Engravings';
import { query } from '@/lib/db';
import { getStudent } from '@/lib/session';
import { countLiveQuizzes } from '@/lib/quizzes/repo';
import { HeroFeatures, type HeroFeature } from './HeroFeatures';
import { TodayInE, TodaySkeleton } from './TodayInE';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const pad2 = (n: number) => String(n).padStart(2, '0');

async function stats() {
  const [[row], live] = await Promise.all([
    query<{ students: number; subjects: number }>(
      `SELECT (SELECT count(*)::int FROM students WHERE active) AS students,
              (SELECT count(DISTINCT code)::int FROM seating_plans WHERE active AND kind = 'class') AS subjects`,
    ),
    countLiveQuizzes(),
  ]);
  return { students: Number(row?.students ?? 0), subjects: Number(row?.subjects ?? 0), live };
}

export default async function Home() {
  const [s, student] = await Promise.all([stats(), getStudent()]);
  const features: HeroFeature[] = [
    {
      href: '/seat',
      label: (
        <>
          My <span className={styles.scriptWord}>Seating</span> Plan
        </>
      ),
      plain: 'My Seating Plan',
      count: s.subjects ? pad2(s.subjects) : '—',
      script: 'Seating',
      caption: 'Find your assigned seat for every class.',
    },
    {
      href: '/timetable',
      label: <>Live Timetable</>,
      plain: 'Live Timetable',
      count: 'live',
      script: 'Timetable',
      caption: 'The latest schedule, straight from the official sheet.',
    },
    {
      href: '/tests',
      label: (
        <>
          OLT <em>Mock</em> Tests
        </>
      ),
      plain: 'OLT Mock Tests',
      count: pad2(s.live),
      script: 'Mock Tests',
      caption: 'Practise MCQs before the real OLT.',
    },
  ];

  return (
    <>
      <div className={styles.hero}>
        <SiteHeader tone="red" />
        <main id="main" className={styles.heroMain}>
          <div className={`container ${styles.heroTop}`}>
            <p className={styles.kicker}>PGDM 2026–28 · Section E</p>
            <h1 className={styles.headline}>
              Outside the building. <em>Above the rest.</em>
            </h1>
          </div>
          <div className="container">
            <HeroFeatures features={features} />
          </div>

          <div className={`container ${styles.notes}`}>
            <div className={styles.note}>
              <Pavilion className={styles.noteArt} />
              <p className="caps">
                Every other section shares a building. Section E has its own — secluded, self-governed, and quietly envied by everyone
                walking past.
              </p>
            </div>
            <div className={`${styles.note} ${styles.noteRight}`}>
              <Crown className={styles.noteArt} />
              <p className="caps">
                Your seat, your classes and your mock tests — personalised to your roll number and refreshed from the official source.
              </p>
            </div>
          </div>

          <div className={styles.monument} aria-hidden>
            <span className={styles.monumentShadow}>E</span>
            <span className={styles.monumentLetter}>E</span>
          </div>
        </main>
      </div>

      <div className={styles.marquee} aria-hidden>
        <div className={styles.marqueeTrack}>
          {Array.from({ length: 2 }).map((_, k) => (
            <span key={k}>
              Outside the building <i>✦</i> Above the rest <i>✦</i> Section E <i>✦</i> PGDM 2026–28 <i>✦</i> Secluded by design <i>✦</i> Envied by default{' '}
              <i>✦</i>{' '}
            </span>
          ))}
        </div>
      </div>

      <section className={styles.manifesto} aria-labelledby="manifesto-title">
        <div className="container">
          <p className="eyebrow">The case for E</p>
          <h2 id="manifesto-title" className={styles.manifestoTitle}>
            Every section has a classroom. <span className={`script ${styles.nowrap}`}>Section E</span> has an address.
          </h2>
          <ol className={styles.points}>
            <li>
              <span className={styles.pointNum}>01</span>
              <h3>Outside the building</h3>
              <p>While everyone else shares corridors and lift queues, we walk out of the academic block and into our own.</p>
            </li>
            <li>
              <span className={styles.pointNum}>02</span>
              <h3>Secluded by design</h3>
              <p>No corridor traffic, no surprise visitors, nobody peering through the door glass. Just us.</p>
            </li>
            <li>
              <span className={styles.pointNum}>03</span>
              <h3>Our rules</h3>
              <p>We’re trusted to run our own space — and we run it better. Freedom looks good on us.</p>
            </li>
            <li>
              <span className={styles.pointNum}>04</span>
              <h3>Quietly envied</h3>
              <p>Ask any other section where they’d rather sit. We’ll wait. (We’ll be outside.)</p>
            </li>
          </ol>
          <dl className={styles.stats}>
            <div>
              <dt>Members</dt>
              <dd className="tabular">{s.students || '—'}</dd>
            </div>
            <div>
              <dt>Subjects on the chart</dt>
              <dd className="tabular">{s.subjects || '—'}</dd>
            </div>
            <div>
              <dt>Building of our own</dt>
              <dd className="tabular">1</dd>
            </div>
            <div>
              <dt>Jealous neighbours</dt>
              <dd>∞</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className={styles.today} aria-labelledby="today-title">
        <div className="container">
          <Suspense fallback={<TodaySkeleton />}>
            <TodayInE />
          </Suspense>
        </div>
      </section>

      <section className={styles.ctaBand}>
        <div className={`container ${styles.ctaInner}`}>
          {student ? (
            <>
              <p className={styles.ctaText}>
                Welcome back, {student.name.split(' ')[0]}. <em>Your seat is waiting.</em>
              </p>
              <Link href="/seat" className="btn btn--accent">
                Open my seating plan <span aria-hidden>→</span>
              </Link>
            </>
          ) : (
            <>
              <p className={styles.ctaText}>
                New here? Claim your roll number once — <em>every page after that is yours.</em>
              </p>
              <Link href="/register" className="btn btn--accent">
                Register with your roll number <span aria-hidden>→</span>
              </Link>
            </>
          )}
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
