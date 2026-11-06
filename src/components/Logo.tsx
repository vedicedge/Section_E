import Link from 'next/link';
import styles from './Logo.module.css';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`${styles.logo} ${className ?? ''}`} aria-label="Section E home">
      <span className={styles.tile} aria-hidden>
        E
      </span>
      <span className={styles.word}>Section E</span>
    </Link>
  );
}
