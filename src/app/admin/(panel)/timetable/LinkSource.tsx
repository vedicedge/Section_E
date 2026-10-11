'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { api } from '@/lib/client-api';
import { formatDateTime, relativeTime } from '@/lib/time';
import { copyKind, plural, StatusNote, type PanelProps, type SaveResult, type Status } from './shared';
import styles from '../../admin.module.css';
import css from './timetable-admin.module.css';

/** What a save or refresh achieved, in words. */
function describe(result: SaveResult, kind: 'save' | 'refresh'): Status {
  const { diagnostics: d, status, error } = result;
  if (!d.config.enabled) return { kind: 'ok', text: 'Saved. The timetable is switched off, so the link wasn’t tested.' };
  if (status === 'ok') {
    const sessions = d.cache ? ` ${plural(d.cache.sessions, 'session')} found for Section ${d.config.section}.` : '';
    return { kind: 'ok', text: `${kind === 'save' ? 'Saved — the timetable downloaded successfully.' : 'Refreshed.'}${sessions}` };
  }
  if (status === null || status === 'unconfigured') {
    return { kind: 'ok', text: 'Saved. No link is set, so students see “Not connected yet”.' };
  }
  const why = error?.message ?? d.cache?.lastError?.message ?? 'The sheet could not be downloaded.';
  return {
    kind: 'error',
    text: status === 'stale' ? `${why} Students keep seeing the last copy that downloaded.` : why,
  };
}

export function LinkSource({ d, now, onSaved, section }: PanelProps & { section: string }) {
  const uid = useId();
  const active = d.config.mode === 'link';
  const [url, setUrl] = useState(d.config.url ?? '');
  const [busy, setBusy] = useState<'save' | 'refresh' | null>(null);
  const [status, setStatus] = useState<Status>(null);

  async function run(kind: 'save' | 'refresh') {
    setBusy(kind);
    setStatus(null);
    const res =
      kind === 'save'
        ? await api<SaveResult>('/api/admin/timetable', { mode: 'link', url: url.trim(), ...(/^[A-J]$/.test(section) ? { section } : {}) }, 'PUT')
        : await api<SaveResult>('/api/admin/timetable', {});
    setBusy(null);
    if (!res.ok) return setStatus({ kind: 'error', text: res.error });
    onSaved(res.data.diagnostics);
    setStatus(describe(res.data, kind));
  }

  const canRefresh = active && Boolean(d.config.url) && d.config.enabled;
  const linkCopy = d.cache && copyKind(d.cache) === 'link' && d.cache.sourceMatches ? d.cache : null;

  return (
    <section className={css.sub} aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className={css.subTitle}>
        Public share <em>link</em>
      </h3>
      <p className={css.explain}>
        The site downloads the sheet straight from its share link — at most every {d.ttlSeconds} seconds, or when someone presses Refresh — so edits to
        the sheet show up without touching this website.
      </p>

      <form
        className={css.linkRow}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          run('save');
        }}
      >
        <label className="field">
          <span>Share link</span>
          <input
            className="input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…/edit?usp=sharing"
            aria-describedby={`${uid}-hints`}
          />
        </label>
        <button type="submit" className="btn btn--accent" disabled={busy !== null}>
          {busy === 'save' ? 'Saving & testing…' : 'Save & test'}
        </button>
      </form>
      <ul id={`${uid}-hints`} className={`hint ${css.hintList}`}>
        <li>Google Drive / Sheets: the file must be shared as “Anyone with the link — Viewer”. Restricted to specific people? Use the relay instead.</li>
        <li>OneDrive / SharePoint: use an “Anyone with the link” share link.</li>
        <li>Leave empty to fall back to the TIMETABLE_URL environment variable.</li>
        <li>
          Exact “last edited” times for Drive files need a Google API key:{' '}
          {d.hasApiKey ? 'configured.' : 'not configured — changes are still detected by content.'}
        </li>
      </ul>

      <div className={styles.actions}>
        <button type="button" className="btn btn--ghost" disabled={busy !== null || !canRefresh} onClick={() => run('refresh')}>
          {busy === 'refresh' ? 'Refreshing…' : 'Refresh now'}
        </button>
        <Link href="/timetable" className="btn btn--ghost">
          View public page
        </Link>
        {linkCopy && (
          <span className="hint">
            Last downloaded{' '}
            <time dateTime={linkCopy.checkedAt} title={formatDateTime(linkCopy.checkedAt)}>
              {relativeTime(linkCopy.checkedAt, now)}
            </time>
          </span>
        )}
      </div>
      <StatusNote status={status} />
    </section>
  );
}

