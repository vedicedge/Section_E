'use client';

import { useId, useRef, useState } from 'react';
import { formatDateTime, relativeTime } from '@/lib/time';
import { copyKind, plural, StatusNote, type Diagnostics, type PanelProps, type Status } from './shared';
import styles from '../../admin.module.css';
import css from './timetable-admin.module.css';

const MAX_UPLOAD = 15 * 1024 * 1024;

interface UploadResult {
  diagnostics: Diagnostics;
  sessions: number;
  detected: boolean;
  summary: string | null;
}

export function UploadSource({ d, now, onSaved }: PanelProps) {
  const uid = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [result, setResult] = useState<(UploadResult & { fileName: string }) | null>(null);

  const copy = d.config.mode === 'upload' && d.cache && copyKind(d.cache) === 'upload' && d.cache.sourceMatches ? d.cache : null;

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0] ?? null;
    if (!file) return setStatus({ kind: 'error', text: 'Choose the timetable .xlsx file first.' });
    if (file.size > MAX_UPLOAD) return setStatus({ kind: 'error', text: 'That file is larger than 15 MB.' });

    setBusy(true);
    setStatus(null);
    setResult(null);
    const form = new FormData();
    form.set('file', file);
    let res: Response;
    let body: UploadResult | { error?: { message?: string } } | null;
    try {
      res = await fetch('/api/admin/timetable/upload', { method: 'POST', body: form, cache: 'no-store' });
      body = await res.json().catch(() => null);
    } catch {
      setBusy(false);
      return setStatus({ kind: 'error', text: 'You seem to be offline. Check your connection and try again.' });
    }
    setBusy(false);
    if (!res.ok || !body || !('diagnostics' in body)) {
      const message = body && 'error' in body ? body.error?.message : undefined;
      // A hosting body-size limit can answer before our route does, without our JSON error.
      const fallback = res.status === 413 ? 'That file is too large for the server to accept.' : `Upload failed (${res.status}).`;
      return setStatus({ kind: 'error', text: message ?? fallback });
    }

    onSaved(body.diagnostics);
    setResult({ ...body, fileName: file.name });
    setPicked(null);
    if (fileRef.current) fileRef.current.value = '';
    const visible = body.diagnostics.config.enabled ? 'Students see it now.' : 'Students see it once the timetable is switched back on.';
    setStatus({
      kind: 'ok',
      text: body.detected
        ? `Uploaded — ${plural(body.sessions, 'session')} found for Section ${body.diagnostics.config.section}. ${visible}`
        : `Uploaded, but the layout wasn’t recognised, so the sheet is shown as it is. ${visible} Details below.`,
    });
  }

  return (
    <section className={css.sub} aria-labelledby={`${uid}-title`}>
      <h3 id={`${uid}-title`} className={css.subTitle}>
        Upload the <em>workbook</em>
      </h3>
      <p className={css.explain}>
        Download the official timetable as an Excel file and upload it here. When the sheet changes, upload the new file — students always see the most
        recent upload, with what changed highlighted.
      </p>

      <form className={css.linkRow} onSubmit={upload} noValidate>
        <label className="field">
          <span>Timetable workbook (.xlsx)</span>
          <input
            ref={fileRef}
            type="file"
            className={`input ${css.fileInput}`}
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            aria-describedby={`${uid}-hint`}
            onChange={(e) => {
              setPicked(e.target.files?.[0] ?? null);
              setStatus(null);
            }}
          />
        </label>
        <button type="submit" className="btn btn--accent" disabled={busy || !picked}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </form>
      <p id={`${uid}-hint`} className="hint">
        In Google Sheets: File › Download › Microsoft Excel (.xlsx). In Excel: File › Save As › Excel Workbook. Up to 15 MB.
      </p>
      <StatusNote status={status} />

      {result ? (
        <dl className={css.facts} aria-label="What the upload contained">
          <div>
            <dt>File</dt>
            <dd>{result.fileName}</dd>
          </div>
          <div>
            <dt>Section {result.diagnostics.config.section} sessions</dt>
            <dd className="tabular">{result.sessions}</dd>
          </div>
          <div>
            <dt>Layout detection</dt>
            <dd>
              {result.detected ? <span className="pill pill--ok">Recognised</span> : <span className="pill pill--warn">Showing sheet as-is</span>}{' '}
              {result.summary}
            </dd>
          </div>
        </dl>
      ) : (
        copy && (
          <dl className={css.facts} aria-label="Current upload">
            <div>
              <dt>Current upload</dt>
              <dd>
                {copy.fileName ?? 'Workbook'}{' '}
                <span className={styles.dim}>
                  · <time dateTime={copy.checkedAt}>{formatDateTime(copy.checkedAt)}</time> ({relativeTime(copy.checkedAt, now)})
                </span>
              </dd>
            </div>
            <div>
              <dt>Section {d.config.section} sessions</dt>
              <dd className="tabular">{copy.sessions}</dd>
            </div>
          </dl>
        )
      )}
    </section>
  );
}
