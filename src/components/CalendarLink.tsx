'use client';

import { useEffect, useId, useState } from 'react';
import { api } from '@/lib/client-api';
import styles from './CalendarLink.module.css';

interface Links {
  url: string;
  webcal: string;
  google: string;
}

type Platform = 'iphone' | 'android';

/**
 * "Your next class on your home screen": a private calendar link the student adds to their phone's
 * calendar once. Each class carries their seat as its location, so the phone's own calendar widget
 * and lock screen show what's next and where to sit.
 */
export function CalendarLink() {
  const uid = useId();
  const [links, setLinks] = useState<Links | null | undefined>(undefined);
  const [platform, setPlatform] = useState<Platform>('iphone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (/android/i.test(navigator.userAgent)) setPlatform('android');
    let cancelled = false;
    void api<{ links: Links | null }>('/api/calendar/link').then((res) => {
      if (cancelled) return;
      if (res.ok) setLinks(res.data.links);
      else {
        setLinks(null);
        setError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function make(reset = false) {
    setBusy(true);
    setError(null);
    const res = await api<{ links: Links }>('/api/calendar/link', { reset });
    setBusy(false);
    setConfirmReset(false);
    if (!res.ok) return setError(res.error);
    setLinks(res.data.links);
    setCopied(false);
  }

  async function copy() {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Couldn’t copy automatically — press and hold the link to copy it.');
    }
  }

  return (
    <section className={styles.wrap} aria-labelledby={`${uid}-h`}>
      <div className={styles.intro}>
        <h2 id={`${uid}-h`} className={styles.title}>
          Your next class, <em>on your home screen</em>
        </h2>
        <p className={styles.lede}>
          Add your classes to your phone’s calendar once. Each class carries your seat, so the calendar widget and lock screen show
          what’s next and where you sit — without opening this site.
        </p>
      </div>

      <div className={styles.body}>
        {links === undefined ? (
          <p className={styles.muted} aria-busy="true">
            Checking for your calendar link…
          </p>
        ) : links === null ? (
          <button type="button" className="btn btn--accent" onClick={() => make()} disabled={busy}>
            {busy ? 'Making your link…' : 'Get my calendar link'}
          </button>
        ) : (
          <>
            <div className={styles.tabs} role="group" aria-label="Your phone">
              <button type="button" aria-pressed={platform === 'iphone'} onClick={() => setPlatform('iphone')}>
                iPhone
              </button>
              <button type="button" aria-pressed={platform === 'android'} onClick={() => setPlatform('android')}>
                Android
              </button>
            </div>

            {platform === 'iphone' ? (
              <ol className={styles.steps}>
                <li>
                  <a href={links.webcal} className="btn btn--accent">
                    Add to iPhone Calendar
                  </a>
                  <span>Then tap Subscribe.</span>
                </li>
                <li>
                  Touch and hold your home screen, tap <strong>Edit</strong> → <strong>Add Widget</strong> (or <strong>+</strong>), choose{' '}
                  <strong>Calendar</strong> and pick <strong>Up Next</strong>.
                </li>
              </ol>
            ) : (
              <ol className={styles.steps}>
                <li>
                  <a href={links.google} className="btn btn--accent" target="_blank" rel="noopener noreferrer">
                    Add to Google Calendar
                  </a>
                  <span>
                    If the Calendar app opens instead, copy the link below and add it at calendar.google.com → Other calendars → + → From
                    URL (in Chrome, turn on Desktop site).
                  </span>
                </li>
                <li>
                  In the Google Calendar app, open Settings → <strong>Section E classes</strong> and turn on <strong>Sync</strong>.
                </li>
                <li>
                  Touch and hold your home screen → <strong>Widgets</strong> → <strong>Google Calendar</strong>, and place the schedule
                  widget.
                </li>
              </ol>
            )}

            <div className={styles.copyRow}>
              <label className="label" htmlFor={`${uid}-url`}>
                Your calendar link
              </label>
              <div className={styles.copyField}>
                <input id={`${uid}-url`} className="input" readOnly value={links.url} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn--ghost btn--sm" onClick={copy}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <p className={styles.note}>
              Calendar apps check for changes every few hours (Google can take up to a day), so the Timetable page here is always the
              latest. Keep this link to yourself: anyone with it can see your classes and seats.
            </p>
            {confirmReset ? (
              <div className={styles.confirm} role="group" aria-label="Make a new link">
                <span>Your current link stops working, and calendars using it stop updating.</span>
                <button type="button" className="btn btn--danger btn--sm" onClick={() => make(true)} disabled={busy}>
                  Make a new link
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmReset(false)}>
                  Keep this one
                </button>
              </div>
            ) : (
              <button type="button" className={styles.textBtn} onClick={() => setConfirmReset(true)}>
                Shared it by mistake? Make a new link
              </button>
            )}
          </>
        )}
        <p className={styles.error} role="status">
          {error}
        </p>
      </div>
    </section>
  );
}
