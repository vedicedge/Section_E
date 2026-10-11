'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client-api';
import { formatDateTime, relativeTime } from '@/lib/time';
import { LinkSource } from './LinkSource';
import { RelaySetup } from './RelaySetup';
import { UploadSource } from './UploadSource';
import { copyKind, MODE_LABEL, StatusNote, type Diagnostics, type Mode, type SaveResult, type Status } from './shared';
import styles from '../../admin.module.css';
import css from './timetable-admin.module.css';

const OPTIONS: { mode: Mode; title: string; text: string; badge?: string }[] = [
  {
    mode: 'relay',
    title: 'Restricted Google Sheet — Apps Script relay',
    text: 'Runs from your Google account and sends changes every 10 minutes. No Google Cloud setup.',
    badge: 'Recommended for restricted sheets',
  },
  {
    mode: 'link',
    title: 'Public share link',
    text: 'The site downloads the sheet itself. It must be shared as “Anyone with the link”.',
  },
  {
    mode: 'upload',
    title: 'Upload the .xlsx manually',
    text: 'When the sheet changes, upload the new file here.',
  },
];

const SWITCH_TO: Record<Mode, string> = {
  relay: 'Generate the setup script below to switch over.',
  link: 'Press Save & test below to switch over.',
  upload: 'Upload the workbook below to switch over.',
};

export function TimetableSettings({ initial, serverNow }: { initial: Diagnostics; serverNow: number }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [now, setNow] = useState(serverNow);
  const [choice, setChoice] = useState<Mode>(initial.config.mode);
  const [section, setSection] = useState(initial.config.section);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // Re-render the server parts (e.g. the section letter in the lede) after each save.
  const onSaved = (next: Diagnostics) => {
    setD(next);
    router.refresh();
  };
  const panel = { d, now, onSaved };
  const active = d.config.mode;

  return (
    <>
      <VisibilitySwitch d={d} onSaved={onSaved} />

      <section className={styles.panel} aria-labelledby="tt-source-title">
        <h2 id="tt-source-title" className={styles.panelTitle}>
          Source
        </h2>
        {!d.config.enabled && (
          <p className="notice notice--warn">
            The timetable is switched off. You can still set up the source — students see it once you switch the timetable back on.
          </p>
        )}

        <fieldset className={css.picker}>
          <legend className="sr-only">Where the timetable comes from</legend>
          {OPTIONS.map((o) => (
            <label key={o.mode} className={css.option}>
              <input
                type="radio"
                name="tt-source"
                value={o.mode}
                checked={choice === o.mode}
                onChange={() => setChoice(o.mode)}
                aria-labelledby={`tt-option-${o.mode}-title`}
                aria-describedby={`tt-option-${o.mode}-text tt-option-${o.mode}-tags`}
              />
              <span id={`tt-option-${o.mode}-title`} className={css.optionTitle}>
                {o.title}
              </span>
              <span id={`tt-option-${o.mode}-text`} className={css.optionText}>
                {o.text}
              </span>
              {(o.badge || active === o.mode) && (
                <span id={`tt-option-${o.mode}-tags`} className={css.optionTags}>
                  {o.badge && <span className={`pill ${css.recommend}`}>{o.badge}</span>}
                  {active === o.mode && <span className="pill pill--ok">In use</span>}
                </span>
              )}
            </label>
          ))}
        </fieldset>

        <SectionField d={d} section={section} setSection={setSection} onSaved={onSaved} />

        {choice !== active && (
          <p className="notice">
            Still in use: <strong>{MODE_LABEL[active]}</strong>. {SWITCH_TO[choice]}
          </p>
        )}

        <div className={css.slot} hidden={choice !== 'relay'}>
          <RelaySetup {...panel} />
        </div>
        <div className={css.slot} hidden={choice !== 'link'}>
          <LinkSource {...panel} section={section} />
        </div>
        <div className={css.slot} hidden={choice !== 'upload'}>
          <UploadSource {...panel} />
        </div>
      </section>

      <LastSync d={d} now={now} />
    </>
  );
}

/* ------------------------------------------------------------- on / off */

function VisibilitySwitch({ d, onSaved }: { d: Diagnostics; onSaved: (next: Diagnostics) => void }) {
  const on = d.config.enabled;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    const res = await api<SaveResult>('/api/admin/timetable', { enabled: !on }, 'PUT');
    setBusy(false);
    if (!res.ok) return setStatus({ kind: 'error', text: res.error });
    onSaved(res.data.diagnostics);
    setStatus({
      kind: 'ok',
      text: res.data.diagnostics.config.enabled
        ? 'The timetable is back on the site.'
        : 'The timetable is now hidden from the site. Homework keeps working with fixed due dates.',
    });
  }

  return (
    <section className={styles.panel} aria-label="Timetable visibility">
      <div className={css.switchRow}>
        <div className={css.switchText}>
          <p id="tt-switch-label" className={css.switchLabel}>
            Show the timetable on the site
          </p>
          <p id="tt-switch-desc" className={css.explain}>
            When off, the Timetable tab, the schedule on the landing page and the next-class hints disappear, and homework can only use fixed due dates.
            Your source settings are kept for when you switch it back on.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="tt-switch-label"
          aria-describedby="tt-switch-desc"
          aria-busy={busy}
          className={css.switch}
          onClick={toggle}
        >
          <span className={css.track} aria-hidden="true">
            <span className={css.thumb} />
          </span>
          <span className={css.switchState} aria-hidden="true">
            {busy ? '…' : on ? 'On' : 'Off'}
          </span>
        </button>
      </div>
      <StatusNote status={status} />
    </section>
  );
}

/* -------------------------------------------------------------- section */

function SectionField({
  d,
  section,
  setSection,
  onSaved,
}: {
  d: Diagnostics;
  section: string;
  setSection: (value: string) => void;
  onSaved: (next: Diagnostics) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const valid = /^[A-J]$/.test(section);
  const dirty = section !== d.config.section;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return setStatus({ kind: 'error', text: 'Use a single letter from A to J.' });
    setBusy(true);
    setStatus(null);
    const res = await api<SaveResult>('/api/admin/timetable', { section }, 'PUT');
    setBusy(false);
    if (!res.ok) return setStatus({ kind: 'error', text: res.error });
    onSaved(res.data.diagnostics);
    setStatus({ kind: 'ok', text: `Saved — the site now picks out Section ${res.data.diagnostics.config.section}.` });
  }

  return (
    <form className={css.sectionRow} onSubmit={save} noValidate>
      <label className={`field ${css.sectionField}`}>
        <span>Our section</span>
        <input
          className="input"
          value={section}
          maxLength={1}
          autoComplete="off"
          aria-invalid={!valid}
          aria-describedby="tt-section-hint"
          onChange={(e) => setSection(e.target.value.trim().toUpperCase())}
        />
      </label>
      <button type="submit" className="btn btn--ghost" disabled={busy || !dirty}>
        {busy ? 'Saving…' : 'Save section'}
      </button>
      <p id="tt-section-hint" className={`hint ${css.sectionHint}`}>
        The letter whose classes are picked out of the sheet. It applies to every source.
      </p>
      <StatusNote status={status} />
    </form>
  );
}

/* ------------------------------------------------------------ last sync */

const CONFIRMED: Record<Mode, string> = {
  link: 'Last successful download',
  relay: 'Last relay check-in',
  upload: 'Uploaded',
};

function LastSync({ d, now }: { d: Diagnostics; now: number }) {
  const c = d.cache;
  return (
    <section className={styles.panel} aria-labelledby="tt-last-title">
      <div className={css.panelHead}>
        <h2 id="tt-last-title" className={styles.panelTitle}>
          Last sync
        </h2>
        {c && !c.sourceMatches && <span className="pill pill--warn">From an earlier source</span>}
      </div>
      {!c ? (
        <p className={styles.dim}>Nothing received yet.</p>
      ) : (
        <>
          {!c.sourceMatches && (
            <p className="notice notice--warn">
              This copy came from an earlier source, not the one in use now, so students don’t see it. They’ll see the timetable as soon as the
              current source delivers its first copy.
            </p>
          )}
          <dl className={css.facts}>
            <div>
              <dt>Source</dt>
              <dd>{c.source}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>
                {c.fileName ?? '—'} <span className={styles.dim}>via {c.via}</span>
              </dd>
            </div>
            <div>
              <dt>{CONFIRMED[copyKind(c)]}</dt>
              <dd>
                <time dateTime={c.checkedAt}>{formatDateTime(c.checkedAt)}</time>{' '}
                <span className={styles.dim}>· {relativeTime(c.checkedAt, now)}</span>
              </dd>
            </div>
            <div>
              <dt>Content last changed</dt>
              <dd>
                <time dateTime={c.contentChangedAt}>{formatDateTime(c.contentChangedAt)}</time>
              </dd>
            </div>
            {c.sourceModifiedAt && (
              <div>
                <dt>Sheet last edited</dt>
                <dd>
                  <time dateTime={c.sourceModifiedAt}>{formatDateTime(c.sourceModifiedAt)}</time>
                </dd>
              </div>
            )}
            <div>
              <dt>Layout detection</dt>
              <dd>
                {c.detection?.ok ? <span className="pill pill--ok">Recognised</span> : <span className="pill pill--warn">Showing sheet as-is</span>}{' '}
                {c.detection?.summary}
              </dd>
            </div>
            <div>
              <dt>Section {d.config.section} sessions</dt>
              <dd className="tabular">{c.sessions}</dd>
            </div>
            {c.lastError && (
              <div>
                <dt>Last error</dt>
                <dd className={css.factError}>
                  {c.lastError.message} ({formatDateTime(c.lastError.at)})
                </dd>
              </div>
            )}
          </dl>
        </>
      )}
      {c && c.warnings.length > 0 && (
        <ul className={styles.warnList}>
          {c.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
