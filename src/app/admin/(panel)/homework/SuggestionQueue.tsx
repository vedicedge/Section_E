'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { formatDateTime, formatDay, relativeTime } from '@/lib/time';
import { LIMITS, type PostResult } from './shared';
import styles from '../../admin.module.css';
import css from './homework.module.css';
import sq from './suggestions.module.css';
import tt from '../timetable/timetable-admin.module.css';

export interface SuggestionView {
  id: string;
  threadUrl: string | null;
  senderName: string;
  senderEmail: string;
  emailSubject: string;
  receivedAt: string;
  receivedOn: string;
  excerpt: string;
  title: string;
  dueMode: 'next_class' | 'date' | null;
  dueDate: string | null;
  /** Subject code guessed from the sender (timetable) or the email text. */
  guess: string | null;
}

export interface InboxInfo {
  hasKey: boolean;
  lastCheckIn: string | null;
  quietHours: number;
}

interface Subject {
  code: string;
  title: string;
}

const OTHER = '+other';
type Status = { kind: 'ok' | 'error'; text: string } | null;

interface Props {
  suggestions: SuggestionView[];
  subjects: Subject[];
  inbox: InboxInfo;
  pushReady: boolean;
  now: number;
}

export function SuggestionQueue({ suggestions, subjects, inbox, pushReady, now }: Props) {
  const uid = useId();
  const [notify, setNotify] = useState(true);
  const [status, setStatus] = useState<Status>(null);
  const quiet = inbox.hasKey && (!inbox.lastCheckIn || now - Date.parse(inbox.lastCheckIn) > inbox.quietHours * 3600_000);

  return (
    <section className={styles.panel} aria-labelledby={`${uid}-heading`}>
      <div className={sq.head}>
        <div>
          <h2 id={`${uid}-heading`} className={styles.panelTitle}>
            Suggested from faculty email<span className="count">({String(suggestions.length).padStart(2, '0')})</span>
          </h2>
          <p className="hint">
            Deadlines found in emails from faculty to the section. Check each one against the email, fix anything that’s off, then add it. Students
            see nothing until you do.
          </p>
        </div>
        {suggestions.length > 0 && (
          <label className={`check ${css.tapCheck}`}>
            <input type="checkbox" checked={pushReady && notify} disabled={!pushReady} onChange={(e) => setNotify(e.target.checked)} />
            Notify students when I add one
          </label>
        )}
      </div>

      <div aria-live="polite">
        {status && (
          <p className={`notice ${status.kind === 'ok' ? 'notice--ok' : ''}`} role={status.kind === 'error' ? 'alert' : undefined}>
            {status.text}
          </p>
        )}
      </div>

      {quiet && (
        <p className="notice notice--warn">
          {inbox.lastCheckIn
            ? `The email script last checked in ${relativeTime(inbox.lastCheckIn, now)}. `
            : 'The email script hasn’t checked in yet. '}
          Open it on script.google.com and look under <strong>Executions</strong> for errors; running <strong>setUp</strong> again restarts it.
        </p>
      )}

      {suggestions.length > 0 ? (
        <ol className={sq.list}>
          {suggestions.map((s) => (
            <li key={s.id}>
              <SuggestionCard s={s} subjects={subjects} notify={pushReady && notify} onDone={setStatus} />
            </li>
          ))}
        </ol>
      ) : (
        inbox.hasKey && <p className={sq.empty}>Nothing waiting. New deadlines appear here within about 30 minutes of the email.</p>
      )}

      <InboxSetup inbox={inbox} now={now} />
    </section>
  );
}

function SuggestionCard({ s, subjects, notify, onDone }: { s: SuggestionView; subjects: Subject[]; notify: boolean; onDone: (status: Status) => void }) {
  const router = useRouter();
  const id = useId();
  const [subject, setSubject] = useState(s.guess ?? (subjects.length ? '' : OTHER));
  const [code, setCode] = useState('');
  const [subjectTitle, setSubjectTitle] = useState('');
  const [title, setTitle] = useState(s.title);
  const [mode, setMode] = useState<'next_class' | 'date'>(s.dueMode ?? 'date');
  const [dueDate, setDueDate] = useState(s.dueDate ?? '');
  const [busy, setBusy] = useState<'add' | 'dismiss' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const picked = subjects.find((x) => x.code === subject);
  const finalCode = subject === OTHER ? code.trim() : (picked?.code ?? '');
  const finalTitle = subject === OTHER ? subjectTitle.trim() : (picked?.title ?? '');

  function problem(): string | null {
    if (!finalCode) return subject === OTHER ? 'Add the subject code.' : 'Pick the subject.';
    if (!finalTitle) return 'Add the subject name.';
    if (!title.trim()) return 'Say what the homework is.';
    if (mode === 'date' && !dueDate) return 'Pick a due date, or choose next class.';
    if (mode === 'date' && dueDate < s.receivedOn) return 'The due date is before the email was sent.';
    return null;
  }

  async function add() {
    const p = problem();
    if (p) return setError(p);
    setBusy('add');
    setError(null);
    const res = await api<PostResult>(`/api/admin/homework/suggestions/${encodeURIComponent(s.id)}`, {
      action: 'add',
      notify,
      item: {
        subjectCode: finalCode,
        subjectTitle: finalTitle,
        title: title.trim(),
        details: `From ${s.senderName || s.senderEmail}’s email “${s.emailSubject}”: ${s.excerpt}`.slice(0, LIMITS.details),
        givenOn: s.receivedOn,
        dueMode: mode,
        dueDate: mode === 'date' ? dueDate : null,
        dueTime: null,
      },
    });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    const n = res.data.notified?.sent ?? 0;
    onDone({
      kind: 'ok',
      text: `Added “${title.trim()}” to Homework${notify ? (res.data.notifyError ? ' — the notification failed' : n ? `, notified ${n} device${n === 1 ? '' : 's'}` : '') : ''}.`,
    });
    router.refresh();
  }

  async function dismiss() {
    setBusy('dismiss');
    setError(null);
    const res = await api(`/api/admin/homework/suggestions/${encodeURIComponent(s.id)}`, { action: 'dismiss' });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    onDone({ kind: 'ok', text: `Dismissed “${s.emailSubject || s.title}”. It won’t come back.` });
    router.refresh();
  }

  return (
    <form
      className={sq.card}
      noValidate
      aria-labelledby={`${id}-subj`}
      onSubmit={(e) => {
        e.preventDefault();
        void add();
      }}
    >
      <div className={sq.source}>
        <p className={sq.from}>
          <strong>{s.senderName || s.senderEmail}</strong>{' '}
          <span className={styles.dim}>
            emailed <time dateTime={s.receivedAt} title={formatDateTime(s.receivedAt)}>{formatDay(s.receivedOn)}</time>
          </span>
        </p>
        <p id={`${id}-subj`} className={sq.subject}>
          {s.emailSubject || '(no subject)'}
          {s.threadUrl && (
            <>
              {' '}
              <a className={sq.open} href={s.threadUrl} target="_blank" rel="noopener noreferrer">
                Open email<span className="sr-only"> (opens in a new tab)</span>
              </a>
            </>
          )}
        </p>
        <blockquote className={sq.excerpt}>{s.excerpt}</blockquote>
      </div>

      <div className={sq.fields}>
        <label className="field">
          <span>Subject</span>
          <select className="input" value={subject} onChange={(e) => setSubject(e.target.value)} aria-describedby={s.guess ? `${id}-guess` : undefined}>
            {subjects.length > 0 && <option value="">Pick a subject</option>}
            {subjects.map((x) => (
              <option key={x.code} value={x.code}>
                {x.code} — {x.title}
              </option>
            ))}
            <option value={OTHER}>Other subject…</option>
          </select>
        </label>
        {s.guess && subject === s.guess && (
          <p id={`${id}-guess`} className="hint">
            Guessed from who sent it. Change it if it’s wrong.
          </p>
        )}
        {subject === OTHER && (
          <div className={css.otherFields}>
            <label className="field">
              <span>Code</span>
              <input className="input" value={code} maxLength={LIMITS.code} placeholder="e.g. BRM" autoComplete="off" onChange={(e) => setCode(e.target.value.toUpperCase())} />
            </label>
            <label className="field">
              <span>Subject name</span>
              <input
                className="input"
                value={subjectTitle}
                maxLength={LIMITS.subjectTitle}
                placeholder="e.g. Business Research Methods"
                autoComplete="off"
                onChange={(e) => setSubjectTitle(e.target.value)}
              />
            </label>
          </div>
        )}
        <label className="field">
          <span>Homework</span>
          <input className="input" value={title} maxLength={LIMITS.title} autoComplete="off" onChange={(e) => setTitle(e.target.value)} />
        </label>

        <fieldset className={css.due}>
          <legend className={css.legend}>Due</legend>
          <label className={css.radio}>
            <input type="radio" name={`${id}-mode`} value="next_class" checked={mode === 'next_class'} onChange={() => setMode('next_class')} />
            <span>Next class of this subject</span>
          </label>
          <div className={css.dateLine}>
            <label className={css.radio}>
              <input type="radio" name={`${id}-mode`} value="date" checked={mode === 'date'} onChange={() => setMode('date')} />
              <span>On date</span>
            </label>
            <input
              type="date"
              className={`input ${css.date}`}
              min={s.receivedOn}
              value={dueDate}
              data-off={mode === 'date' ? undefined : ''}
              aria-label="Due date"
              onChange={(e) => {
                setDueDate(e.target.value);
                setMode('date');
              }}
            />
          </div>
          {!s.dueMode && <p className="hint">No date was found in the email. Check it and fill one in.</p>}
        </fieldset>
      </div>

      {error && (
        <p className={css.rowError} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <button type="submit" className={`btn btn--sm ${css.tap}`} disabled={busy !== null}>
          {busy === 'add' ? 'Adding…' : 'Add to homework'}
        </button>
        <button type="button" className={`btn btn--ghost btn--sm ${css.tap}`} disabled={busy !== null} onClick={dismiss}>
          {busy === 'dismiss' ? 'Dismissing…' : 'Dismiss'}
        </button>
      </div>
    </form>
  );
}

function InboxSetup({ inbox, now }: { inbox: InboxInfo; now: number }) {
  const uid = useId();
  const [list, setList] = useState('pgdm2026sec-e@imi.edu');
  const [domain, setDomain] = useState('imi.edu');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [script, setScript] = useState<{ script: string; endpoint: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const scriptRef = useRef<HTMLPreElement>(null);

  async function generate() {
    if (inbox.hasKey && !confirm('Generate a new setup script? The script you set up before stops working until you paste the new one into Apps Script.')) return;
    setBusy(true);
    setStatus(null);
    setCopied(null);
    const res = await api<{ script: string; endpoint: string }>('/api/admin/homework/inbox-key', { sectionList: list.trim(), facultyDomain: domain.trim() });
    setBusy(false);
    if (!res.ok) return setStatus({ kind: 'error', text: res.error });
    setScript(res.data);
    setStatus({ kind: 'ok', text: 'Your setup script is ready below. Copy it now — for safety it is shown only once.' });
  }

  async function copy() {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script.script);
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

  const local = script && (!script.endpoint.startsWith('https://') || /\/\/(localhost|127\.|\[::1\])/.test(script.endpoint));

  return (
    <details className={sq.setup} open={!inbox.hasKey}>
      <summary className={sq.setupSummary}>
        {inbox.hasKey ? 'Email script' : 'Set up the email script'}
        <span className={styles.dim}>
          {inbox.hasKey
            ? inbox.lastCheckIn
              ? ` — last checked in ${relativeTime(inbox.lastCheckIn, now)}`
              : ' — waiting for its first run'
            : ''}
        </span>
      </summary>
      <p className="hint">
        A short script runs in your own college Google account and sends new faculty emails to the section here every 30 minutes. The site keeps
        only the sentences that mention a deadline, never the whole email.
      </p>
      <form
        className={sq.setupForm}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
      >
        <label className="field">
          <span>Section mailing list</span>
          <input className="input" type="email" value={list} autoComplete="off" spellCheck={false} onChange={(e) => setList(e.target.value)} aria-describedby={`${uid}-list`} />
        </label>
        <label className="field">
          <span>Faculty email domain</span>
          <input className="input" value={domain} autoComplete="off" spellCheck={false} onChange={(e) => setDomain(e.target.value)} />
        </label>
        <button type="submit" className="btn btn--accent" disabled={busy}>
          {busy ? 'Generating…' : inbox.hasKey ? 'Generate a new setup script' : 'Generate setup script'}
        </button>
      </form>
      <p id={`${uid}-list`} className="hint">
        The address faculty write to for the whole section. Only emails sent to it, from someone at the domain, are read.
      </p>
      <div aria-live="polite">
        {status && (
          <p className={`notice ${status.kind === 'ok' ? 'notice--ok' : ''}`} role={status.kind === 'error' ? 'alert' : undefined}>
            {status.text}
          </p>
        )}
      </div>
      {script && (
        <>
          <ol className={sq.steps}>
            <li>Sign in to your college Google account and open script.google.com → New project.</li>
            <li>Replace the code with the script below and save.</li>
            <li>Choose “setUp” in the toolbar, press Run, and allow access to Gmail.</li>
          </ol>
          <div className={tt.scriptBox}>
            <div className={tt.scriptBar}>
              <span className="label" id={`${uid}-script`}>
                Setup script
              </span>
              <span className={styles.actions}>
                <span className={tt.copied} aria-live="polite">
                  {copied}
                </span>
                <button type="button" className={`btn btn--sm ${tt.tap}`} onClick={copy}>
                  Copy script
                </button>
              </span>
            </div>
            <pre ref={scriptRef} className={tt.script} tabIndex={0} aria-labelledby={`${uid}-script`}>
              <code>{script.script}</code>
            </pre>
          </div>
          {local && (
            <p className="notice notice--warn">
              Google can’t reach {script.endpoint}. Generate the script from the live site, otherwise it has nowhere to send emails.
            </p>
          )}
        </>
      )}
    </details>
  );
}
