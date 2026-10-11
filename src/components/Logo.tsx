import Link from 'next/link';
import styles from './Logo.module.css';

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={`${styles.logo} ${className ?? ''}`} aria-label="Section E — home">
      <span className={styles.word}>Section</span>
      <span className={styles.letter}>E</span>
    </Link>
  );
}
