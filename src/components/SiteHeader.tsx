import Link from 'next/link';
import { getStudent } from '@/lib/session';
import { Logo } from './Logo';
import { MenuButton } from './Menu';
import styles from './SiteHeader.module.css';

/** Header shared by every student page: "+" menu · script logotype · identity link. */
export async function SiteHeader({ tone = 'paper' }: { tone?: 'paper' | 'red' }) {
  const student = await getStudent();
  return (
    <header className={`${styles.header} ${tone === 'red' ? styles.red : ''}`}>
      <div className={`container ${styles.inner}`}>
        <div className={styles.left}>
          <MenuButton student={student ? { rollNo: student.rollNo, name: student.name } : null} />
        </div>
        <Logo className={styles.logo} />
        <div className={styles.right}>
          {student ? (
            <Link href="/seat" className={styles.cta} title={`Signed in as ${student.name}`}>
              <span className={styles.ctaLong}>{student.rollNo}</span>
              <span className={styles.ctaShort}>My seat</span>
            </Link>
          ) : (
            <Link href="/register" className={styles.cta}>
              Register
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
