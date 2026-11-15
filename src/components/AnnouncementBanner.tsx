'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './Board.module.css';

interface Props {
  id: string;
  title: string;
  body: string;
  more: number;
}

/** The newest announcement this student hasn't seen. "Got it" counts it as seen and hides it. */
export function AnnouncementBanner({ id, title, body, more }: Props) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    fetch('/api/announcements/seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    }).catch(() => undefined);
  }

  return (
    <aside className={styles.banner} aria-label="New announcement" data-testid="announcement-banner">
      <svg className={styles.bannerIcon} width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <path d="M4 10v4h3l6 4V6L7 10H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className={styles.bannerText}>
        <span className={styles.bannerTitle}>{title}</span>
        {body && <span className={styles.bannerBody}>{body}</span>}
        <span className={styles.bannerActions}>
          <Link href="/announcements" className="arrow-link">
            {more ? `Read it and ${more} more` : 'Read it'}
          </Link>
          <button type="button" className={styles.linkButton} onClick={dismiss}>
            Got it
          </button>
        </span>
      </div>
    </aside>
  );
}
