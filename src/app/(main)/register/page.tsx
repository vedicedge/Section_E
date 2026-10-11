import Link from 'next/link';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { Pavilion } from '@/components/Engravings';
import { RegisterFlow } from './RegisterFlow';
import { SignOutButton } from './SignOutButton';
import styles from './register.module.css';

export const metadata: Metadata = { title: 'Register' };
export const dynamic = 'force-dynamic';

function safeNext(next: string | string[] | undefined): string {
  const value = Array.isArray(next) ? next[0] : next;
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/seat';
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [student, params] = await Promise.all([getStudent(), searchParams]);
  const next = safeNext(params.next);

  return (
    <div className={`container page ${styles.wrap}`}>
      <section className={styles.intro}>
        <p className="eyebrow">Members only</p>
        <h1 className="page-title">
          Claim your <span className="script">seat</span>.
        </h1>
        <p className={styles.lede}>
          Register once with your college roll number and a 4-digit PIN. After that this device remembers you, and every page shows
          only what’s yours.
        </p>
        <ul className={styles.facts}>
          <li>
            <span>01</span> Your roll number is checked against the Section E roster.
          </li>
          <li>
            <span>02</span> The PIN stops anyone else from opening your seat or your test results.
          </li>
          <li>
            <span>03</span> Forgot it? The admin can reset your registration.
          </li>
        </ul>
        <Pavilion className={styles.art} />
      </section>

      <section className={styles.panel} aria-label="Registration">
        {student ? (
          <div className={styles.done}>
            <p className="eyebrow">Registered on this device</p>
            <p className={styles.doneName}>{student.name}</p>
            <p className="tabular muted">{student.rollNo}</p>
            <div className={styles.doneActions}>
              <Link href={next} className="btn btn--accent">
                Continue <span aria-hidden>→</span>
              </Link>
              <SignOutButton />
            </div>
          </div>
        ) : (
          <RegisterFlow next={next} />
        )}
      </section>
    </div>
  );
}
