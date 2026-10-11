'use client';

import { useId, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { formatDateTime, relativeTime } from '@/lib/time';
import { copyKind, isGoogleLink, StatusNote, type Diagnostics, type PanelProps, type SaveResult, type Status } from './shared';
import styles from '../../admin.module.css';
import css from './timetable-admin.module.css';

interface Setup {
  script: string;
  endpoint: string;
}

/** Google Apps Script can only call a public https address. */
const unreachable = (endpoint: string) => !endpoint.startsWith('https://') || /\/\/(localhost|127\.|\[::1\])/.test(endpoint);

export function RelaySetup({ d, now, onSaved }: PanelProps) {
  const uid = useId();
  const active = d.config.mode === 'relay';
  const copy = d.cache && copyKind(d.cache) === 'relay' ? d.cache : null;
  const [url, setUrl] = useState(isGoogleLink(d.config.url) ? d.config.url : '');
  const [busy, setBusy] = useState<'generate' | 'activate' | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const scriptRef = useRef<HTMLPreElement>(null);

  const quiet = Boolean(active && copy && now - Date.parse(copy.checkedAt) > d.relayQuietHours * 3600_000);

  async function generate() {
    if (
      d.config.hasRelayKey &&
      !confirm('Generate a new setup script? The script you set up before stops working until you paste the new one into Apps Script.')
    ) {
      return;
    }
    setBusy('generate');
    setStatus(null);
    setCopied(null);
    const res = await api<Setup & { diagnostics: Diagnostics }>('/api/admin/timetable/relay-key', { url: url.trim() || undefined });
    setBusy(null);
    if (!res.ok) return setStatus({ kind: 'error', text: res.error });
    setSetup({ script: res.data.script, endpoint: res.data.endpoint });
    onSaved(res.data.diagnostics);
    setStatus({ kind: 'ok', text: 'Your setup script is ready below. Copy it now — for safety it is shown only once. The site now takes the timetable from the relay.' });
  }

  async function activate() {
    setBusy('activate');
    setStatus(null);
    const res = await api<SaveResult>('/api/admin/timetable', { mode: 'relay' }, 'PUT');
    setBusy(null);
    if (!res.ok) return setStatus({ kind: 'error', text: res.error });
    onSaved(res.data.diagnostics);
    setStatus({ kind: 'ok', text: 'Switched back to the relay. Its next run, within 10 minutes, brings the timetable up to date.' });
  }

  async function copyScript() {
    if (!setup) return;
    try {
      await navigator.clipboard.writeText(setup.script);
      setCopied('Copied.');
    } catch {
      const el = scriptRef.current;
      if (el) {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      setCopied('Couldn’t copy automatically. The script is selected — press Ctrl+C (⌘C on a Mac).');
    }
  }

  return (
    <section className={css.sub} aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className={css.subTitle}>
        Apps Script <em>relay</em>
      </h3>
      <p className={css.explain}>
        A short script runs in your own Google account — the one that can open the restricted timetable — and sends the workbook here whenever it
        changes. The sheet’s sharing stays exactly as it is.
      </p>

      <dl className={css.facts}>
        <div>
          <dt>Setup script</dt>
          <dd>
            {d.config.hasRelayKey ? (
              <span className="pill pill--ok">
                <span className="dot" aria-hidden="true" /> Generated
              </span>
            ) : (
              'Not set up yet'
            )}
          </dd>
        </div>
        <div>
          <dt>Last check-in</dt>
          <dd>
            {copy ? (
              <>
                <time dateTime={copy.checkedAt}>{relativeTime(copy.checkedAt, now)}</time> <span className={styles.dim}>· {formatDateTime(copy.checkedAt)}</span>
              </>
            ) : d.config.hasRelayKey ? (
              'Waiting for the first run'
            ) : (
              '—'
            )}
          </dd>
        </div>
        {copy?.sourceModifiedAt && (
          <div>
            <dt>Sheet last edited</dt>
            <dd>{formatDateTime(copy.sourceModifiedAt)}</dd>
          </div>
        )}
        {copy?.lastError && (
          <div>
            <dt>Last problem</dt>
            <dd className={css.factError}>
              {copy.lastError.message} ({formatDateTime(copy.lastError.at)})
            </dd>
          </div>
        )}
      </dl>

      {quiet && (
        <p className="notice notice--warn">
          The relay hasn’t checked in for over {d.relayQuietHours} hours, so students see a note that the timetable may be out of date. Open the project on
          script.google.com and look under <strong>Executions</strong> for errors; running <strong>setUp</strong> again restarts it.
        </p>
      )}

      {!active && d.config.hasRelayKey && (
        <div className={styles.actions}>
          <button type="button" className="btn btn--ghost" onClick={activate} disabled={busy !== null}>
            {busy === 'activate' ? 'Switching…' : 'Use my existing relay again'}
          </button>
          <span className="hint">If the script you set up before is still running.</span>
        </div>
      )}

      <form
        className={css.linkRow}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          generate();
        }}
      >
        <label className="field">
          <span>Google Sheet link</span>
          <input
            className="input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/…/edit"
            aria-describedby={`${uid}-link-hint`}
          />
        </label>
        <button type="submit" className="btn btn--accent" disabled={busy !== null}>
          {busy === 'generate' ? 'Generating…' : d.config.hasRelayKey ? 'Generate a new setup script' : 'Generate setup script'}
        </button>
      </form>
      <p id={`${uid}-link-hint`} className="hint">
        Open the timetable in your browser and copy the address bar. Nothing about the sheet’s sharing needs to change.
      </p>
      <StatusNote status={status} />

      {setup && (
        <div className={css.scriptBox}>
          <div className={css.scriptBar}>
            <span className="label" id={`${uid}-script`}>
              Setup script
            </span>
            <span className={styles.actions}>
              <span className={css.copied} aria-live="polite">
                {copied}
              </span>
              <button type="button" className={`btn btn--sm ${css.tap}`} onClick={copyScript}>
                Copy script
              </button>
            </span>
          </div>
          <pre ref={scriptRef} className={css.script} tabIndex={0} aria-labelledby={`${uid}-script`}>
            <code>{setup.script}</code>
          </pre>
        </div>
      )}
      {setup && unreachable(setup.endpoint) && (
        <p className="notice notice--warn">
          Google can’t reach <code className={css.code}>{setup.endpoint}</code>. Generate the script from the live site (or set{' '}
          <code className={css.code}>NEXT_PUBLIC_SITE_URL</code>), otherwise the relay has nowhere to send the timetable.
        </p>
      )}

      <ol className={css.steps} role="list" aria-label="Setting up the relay">
        <li>
          <span>
            Open{' '}
            <a className="link" href="https://script.google.com/" target="_blank" rel="noopener noreferrer">
              script.google.com
            </a>{' '}
            while signed in to the Google account that can open the timetable.
          </span>
        </li>
        <li>
          <span>
            <strong>New project</strong> → delete the sample code → paste {setup ? 'the script above' : 'the setup script'} → <strong>Save</strong>.
          </span>
        </li>
        <li>
          <span>
            In the toolbar choose <strong>setUp</strong> and press <strong>Run</strong>; allow access when Google asks. It may say the app is unverified — it
            is your own script: <strong>Advanced</strong> → <strong>Go to project</strong>.
          </span>
        </li>
        <li>
          <span>That’s it: it checks every 10 minutes and sends changes.</span>
        </li>
      </ol>
      <ul className={`hint ${css.hintList}`}>
        <li>Generating a new script invalidates the previous one.</li>
        <li>If the college’s Google account blocks Apps Script, use manual upload instead.</li>
        <li>The script holds a private key that lets it update the timetable — keep it to yourself.</li>
        <li>Moving to another source later? Delete the Apps Script project too, so Google stops emailing you about failed runs.</li>
      </ul>
    </section>
  );
}
