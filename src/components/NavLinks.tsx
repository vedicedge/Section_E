'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavLink } from './nav';
import styles from './SiteHeader.module.css';

/** The desktop row of links in the bar; the current page is marked. */
export function NavLinks({ links, dueTomorrow }: { links: NavLink[]; dueTomorrow: number }) {
  const pathname = usePathname();
  return (
    <div className={styles.links}>
      {links.map((l) => {
        const on = pathname === l.href || pathname.startsWith(l.href + '/');
        return (
          <Link key={l.href} href={l.href} className={`${styles.link} ${on ? styles.linkOn : ''}`} aria-current={on ? 'page' : undefined}>
            {l.label}
            {l.href === '/homework' && dueTomorrow > 0 && (
              <span className={`${styles.badge} tabular`} aria-label={`, ${dueTomorrow} due tomorrow`}>
                {dueTomorrow > 9 ? '9+' : dueTomorrow}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
