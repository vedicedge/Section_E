'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import { formatDay } from '@/lib/time';
import type { ReminderResult } from './shared';
import styles from '../../admin.module.css';
import css from './homework.module.css';

type Status = { kind: 'ok' | 'error'; text: string } | null;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function reminderMessage(r: ReminderResult): NonNullable<Status> {
  const day = formatDay(r.date);
  switch (r.skipped) {
    case 'not_configured':
      return { kind: 'error', text: 'Push notifications aren’t configured yet — set the keys listed below, then redeploy.' };
    case 'nothing_due':
      return { kind: 'ok', text: `Nothing is due tomorrow (${day}) — no reminder needed.` };
    case 'no_subscribers':
      return { kind: 'ok', text: `${plural(r.homework, 'task')} due tomorrow, but no one has reminders on yet.` };
    case 'already_sent':
      return { kind: 'ok', text: 'Tomorrow’s reminder has already gone out.' };
  }
  if (!r.students) return { kind: 'ok', text: `Everyone with reminders on has already ticked off tomorrow’s ${plural(r.homework, 'task')} — nothing to send.` };
  const failed = r.push?.failed ? ` ${plural(r.push.failed, 'device')} couldn’t be reached.` : '';
  return { kind: 'ok', text: `Sent to ${plural(r.students, 'student')} for ${plural(r.homework, 'task')} due ${day}.${failed}` };
}

interface Props {
  configured: boolean;
  cronReady: boolean;
  stats: { devices: number; students: number };
  /** `when` is formatted on the server so it hydrates identically. */
  last: { when: string; recipients: number } | null;
  /** What's due tomorrow, ready for the class WhatsApp group. */
  share: { date: string; count: number; text: string | null };
}

export function ReminderPanel({ configured, cronReady, stats, last, share }: Props) {
  const router = useRouter();
  const uid = useId();
  const preview = useRef<HTMLTextAreaElement>(null);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function send() {
    setSending(true);
    setStatus(null);
    const res = await api<ReminderResult>('/api/admin/homework/remind', {});
    setSending(false);
    if (!res.ok) return setStatus({ kind: 'error', text: res.error });
    setStatus(reminderMessage(res.data));
    router.refresh();
  }

  async function copy() {
    if (!share.text) return;
    try {
      await navigator.clipboard.writeText(share.text);
      setCopied('Copied — paste it into the class group.');
    } catch {
      preview.current?.focus();
      preview.current?.select();
      setCopied('Couldn’t copy automatically. The text is selected — press Ctrl+C, or long-press and choose Copy.');
    }
  }

  return (
    <section className={styles.panel} aria-labelledby={`${uid}-heading`}>
      <div className={css.panelHead}>
        <h2 id={`${uid}-heading`} className={styles.panelTitle}>
          Evening reminder
        </h2>
        <span className={`pill ${configured ? 'pill--ok' : 'pill--warn'}`}>
          <span className="dot" aria-hidden="true" />
          {configured ? 'Push on' : 'Push not set up'}
        </span>
      </div>
      <p className={css.explain}>
        Every evening around 7 pm IST, students with reminders on get a notification listing the homework due tomorrow that they haven’t ticked off.
      </p>

      <div className={`${styles.row2} ${css.reminderGrid}`}>
        <div className={css.col}>
          <dl className={css.facts}>
            <div>
              <dt>Reminders on</dt>
              <dd>
                {stats.devices
                  ? `${plural(stats.students, 'student')} · ${plural(stats.devices, 'device')} ${stats.devices === 1 ? 'has' : 'have'} reminders on`
                  : 'No one has turned reminders on yet.'}
              </dd>
            </div>
            <div>
              <dt>Last sent</dt>
              <dd>{last ? `Last evening reminder: ${last.when} to ${plural(last.recipients, 'student')}` : 'No evening reminder has gone out yet.'}</dd>
            </div>
            <div>
              <dt>Schedule</dt>
              <dd>{cronReady ? 'Daily, about 7 pm IST' : 'Off — CRON_SECRET is not set'}</dd>
            </div>
          </dl>

          {!configured && (
            <div className="notice notice--warn">
              <p>To switch notifications on, set these environment variables and redeploy:</p>
              <ul className={css.envList}>
                <li>
                  <code className={css.envCode}>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code>
                </li>
                <li>
                  <code className={css.envCode}>VAPID_PRIVATE_KEY</code>
                </li>
                <li>
                  <code className={css.envCode}>VAPID_SUBJECT</code> — e.g. <code className={css.envCode}>mailto:you@example.com</code>
                </li>
              </ul>
              <p>
                Generate the key pair with <code className={css.envCode}>npx web-push generate-vapid-keys</code>.
              </p>
            </div>
          )}

          <details className={css.details} open={!cronReady}>
            <summary>How the evening job runs</summary>
            <p>
              On Vercel it runs from <code className={css.envCode}>vercel.json</code> (Cron) and needs <code className={css.envCode}>CRON_SECRET</code> set.
              Anywhere else, any scheduler can call <code className={css.envCode}>GET /api/cron/homework-reminders</code> with the header{' '}
              <code className={css.envCode}>Authorization: Bearer &lt;CRON_SECRET&gt;</code>. Each evening’s reminder goes out once, however often it is called.
            </p>
          </details>

          <div className={`${styles.actions} ${css.wrapBtns}`}>
            <button type="button" className="btn btn--accent" disabled={sending} onClick={send}>
              {sending ? 'Sending…' : 'Send tomorrow’s reminder now'}
            </button>
          </div>
          <div aria-live="polite" aria-atomic="true">
            {status && <p className={`notice ${status.kind === 'ok' ? 'notice--ok' : ''}`}>{status.text}</p>}
          </div>
        </div>

        <div className={`${css.col} ${css.share}`}>
          <h3 className={css.subTitle}>Share to WhatsApp</h3>
          {share.text ? (
            <>
              <p className="hint">
                Due tomorrow, {formatDay(share.date)} · {plural(share.count, 'task')}
              </p>
              <label className="field">
                <span>Message preview</span>
                <textarea ref={preview} className={`textarea ${css.preview}`} rows={8} readOnly value={share.text} />
              </label>
              <div className={`${styles.actions} ${css.wrapBtns}`}>
                <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(share.text)}`} target="_blank" rel="noopener noreferrer">
                  Open in WhatsApp<span className="sr-only"> (opens in a new tab)</span>
                </a>
                <button type="button" className="btn btn--ghost" onClick={copy}>
                  Copy text
                </button>
              </div>
              <p className="hint" aria-live="polite">
                {copied}
              </p>
            </>
          ) : (
            <p className={styles.dim}>Nothing is due tomorrow ({formatDay(share.date)}) — nothing to share.</p>
          )}
        </div>
      </div>
    </section>
  );
}
