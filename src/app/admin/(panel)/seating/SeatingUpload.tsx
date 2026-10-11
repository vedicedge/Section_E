'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import styles from '../../admin.module.css';

interface Preview {
  sourceName: string;
  plans: { sheetName: string; code: string; title: string; rows: { label: string; seats: number }[]; assigned: number; warnings: string[] }[];
  students: number;
  newStudents: number;
  warnings: string[];
}

export function SeatingUpload({ hasPlans }: { hasPlans: boolean }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<'file' | 'url'>('file');
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'replace' | 'add'>(hasPlans ? 'replace' : 'replace');
  const [kind, setKind] = useState<'class' | 'exam'>('class');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [room, setRoom] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function form(commit: boolean) {
    const fd = new FormData();
    if (source === 'file' && fileRef.current?.files?.[0]) fd.set('file', fileRef.current.files[0]);
    if (source === 'url') fd.set('url', url);
    fd.set('commit', commit ? '1' : '0');
    fd.set('mode', mode);
    fd.set('kind', kind);
    fd.set('validFrom', validFrom);
    fd.set('validTo', validTo);
    fd.set('room', room);
    fd.set('sheets', JSON.stringify(selected));
    return fd;
  }

  async function send(commit: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/seating', { method: 'POST', body: form(commit) });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? 'Upload failed.');
      setPreview(data.preview);
      if (!commit) setSelected(data.preview.plans.map((p: Preview['plans'][number]) => p.sheetName));
      if (commit) {
        setMessage({
          kind: 'ok',
          text: `Imported ${data.result.imported} plan(s)${data.result.removed ? `, replaced ${data.result.removed}` : ''}; ${data.result.addedStudents} new student(s) added to the roster.`,
        });
        setPreview(null);
        if (fileRef.current) fileRef.current.value = '';
        router.refresh();
      }
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="upload">
      <h2 id="upload" className={styles.panelTitle}>
        Upload a seating plan
      </h2>
      <div className={styles.actions} role="radiogroup" aria-label="Source">
        <label className="check">
          <input type="radio" checked={source === 'file'} onChange={() => setSource('file')} /> Excel file
        </label>
        <label className="check">
          <input type="radio" checked={source === 'url'} onChange={() => setSource('url')} /> Share link (Google Drive, OneDrive…)
        </label>
      </div>
      {source === 'file' ? (
        <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="input" onChange={() => setPreview(null)} />
      ) : (
        <input className="input" value={url} onChange={(e) => (setUrl(e.target.value), setPreview(null))} placeholder="https://docs.google.com/spreadsheets/d/…" />
      )}
      <div className={styles.row3}>
        <label className="field">
          <span>Import mode</span>
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value as 'replace' | 'add')}>
            <option value="replace">Replace all current plans</option>
            <option value="add">Add alongside current plans</option>
          </select>
        </label>
        <label className="field">
          <span>Type</span>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'class' | 'exam')}>
            <option value="class">Class seating</option>
            <option value="exam">Exam seating</option>
          </select>
        </label>
        <label className="field">
          <span>Room (optional)</span>
          <input className="input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Section E classroom" />
        </label>
      </div>
      <div className={styles.row2}>
        <label className="field">
          <span>Valid from (optional)</span>
          <input className="input" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>Valid until (optional)</span>
          <input className="input" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </label>
      </div>
      <p className="hint">
        Use dates for arrangements that apply only to an exam or a period — students see them as “coming up” until they start, and they disappear after
        they end.
      </p>
      <div className={styles.actions}>
        <button className="btn btn--ghost" disabled={busy} onClick={() => send(false)}>
          {busy && !preview ? 'Reading…' : 'Preview'}
        </button>
        {preview && (
          <button className="btn btn--accent" disabled={busy || !selected.length} onClick={() => send(true)}>
            {busy ? 'Importing…' : `Import ${selected.length} plan(s)`}
          </button>
        )}
      </div>
      {message && (
        <p className={`notice ${message.kind === 'ok' ? 'notice--ok' : ''}`} role={message.kind === 'error' ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      {preview && (
        <div className={styles.stack} style={{ gap: 12 }}>
          <p>
            <strong>{preview.sourceName}</strong> — {preview.plans.length} sheet(s), {preview.students} students ({preview.newStudents} new to the roster).
          </p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Import</th>
                  <th scope="col">Code</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Rows (seats)</th>
                  <th scope="col">Students</th>
                </tr>
              </thead>
              <tbody>
                {preview.plans.map((p) => (
                  <tr key={p.sheetName}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(p.sheetName)}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.sheetName] : s.filter((x) => x !== p.sheetName)))}
                        aria-label={`Import ${p.code}`}
                      />
                    </td>
                    <th scope="row">{p.code}</th>
                    <td>
                      {p.title}
                      {p.warnings.length > 0 && (
                        <ul className={styles.warnList}>
                          {p.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className={`${styles.mono} dim`}>{p.rows.map((r) => `${r.label} (${r.seats})`).join(' · ')}</td>
                    <td className={styles.mono}>{p.assigned}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.warnings.length > 0 && (
            <ul className={styles.warnList}>
              {preview.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
