'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/client-api';
import type { GroupSetSummary } from '@/lib/groups/repo';
import styles from '../../admin.module.css';

type Preview = GroupsPreview | TopicsPreview;

interface TopicsPreview {
  kind: 'topics';
  sourceName: string;
  subject: string;
  title: string;
  topics: { name: string; topic: string; found: boolean }[];
}

interface GroupsPreview {
  kind: 'groups';
  sourceName: string;
  subject: string;
  title: string;
  groups: { name: string; topic: string | null; members: { rollNo: string; name: string | null }[] }[];
  unknown: string[];
  duplicates: string[];
  ignoredRows: number;
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const list = { listStyle: 'none', padding: 0, margin: '16px 0 0', display: 'grid', gap: 10 } as const;

export function GroupsForm({ sets }: { sets: GroupSetSummary[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'save' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function send(commit: boolean) {
    const form = formRef.current;
    if (!form) return;
    const data = new FormData(form);
    data.set('commit', commit ? '1' : '0');
    setBusy(commit ? 'save' : 'preview');
    setErr(null);
    setMsg(null);
    const res = await fetch('/api/admin/groups', { method: 'POST', body: data });
    const json = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      setPreview(null);
      return setErr(json?.error?.message ?? `Request failed (${res.status}).`);
    }
    if (!commit) return setPreview(json.preview);
    if (json.preview.kind === 'topics') {
      setMsg(`Added topics to ${count(json.saved.matched, 'group')} in ${json.preview.subject} · ${json.preview.title}.`);
      setPreview(null);
      form.reset();
      return router.refresh();
    }
    const s = json.saved as { replaced: boolean; groups: number; students: number };
    setMsg(`${s.replaced ? 'Replaced' : 'Saved'} ${json.preview.subject} · ${json.preview.title}: ${s.groups} groups, ${s.students} students.`);
    setPreview(null);
    form.reset();
    router.refresh();
  }

  async function remove(set: GroupSetSummary) {
    if (!confirm(`Delete “${set.subject} · ${set.title}”? Students will stop seeing these groups.`)) return;
    const res = await api(`/api/admin/groups/${set.id}`, undefined, 'DELETE');
    if (!res.ok) return setErr(res.error);
    router.refresh();
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(false);
  };
  const total = preview?.kind === 'groups' ? preview.groups.reduce((n, g) => n + g.members.length, 0) : 0;
  const saveLabel = !preview
    ? ''
    : preview.kind === 'topics'
      ? `Save ${count(preview.topics.filter((t) => t.found).length, 'topic')}`
      : `Save ${count(preview.groups.length, 'group')}`;

  return (
    <>
      {msg && (
        <p className="notice" role="status">
          {msg}
        </p>
      )}
      {err && (
        <p className="notice" role="alert">
          {err}
        </p>
      )}

      <form ref={formRef} className={styles.panel} onSubmit={onSubmit} onChange={() => setPreview(null)}>
        <h2 className={styles.panelTitle}>Upload a group list</h2>
        <p className={styles.dim}>
          Any of these works: a “Roll No” column with a “Group” column (and optionally “Topic”); one row per group with the roll numbers
          across; or a “Group 1” line with its members underneath. A topic can sit in a “Topic” column or after the group name
          (“Group 3 – Retail strategy”); groups without one simply show none. Topics handed out later? Upload just “Group | Topic” with
          the same subject and title, and they’re added to that list. Uploading groups again with the same subject and title replaces the list.
        </p>
        <div className={styles.row2}>
          <label className="field">
            <span className="label">Subject</span>
            <input className="input" name="subject" required maxLength={40} placeholder="e.g. CF" />
          </label>
          <label className="field">
            <span className="label">Title (optional)</span>
            <input className="input" name="title" maxLength={60} placeholder="e.g. Project groups" />
          </label>
        </div>
        <label className="field">
          <span className="label">File (.xlsx or .csv)</span>
          <input
            className="input"
            name="file"
            type="file"
            accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          />
        </label>
        <label className="field">
          <span className="label">…or paste the list</span>
          <textarea
            className="input"
            name="text"
            rows={8}
            placeholder={'Roll No\tGroup\tTopic\n26PGDM101\t1\tTata Steel\n26PGDM102\t1\n26PGDM103\t2\tInfosys'}
          />
        </label>
        <div className={styles.actions}>
          <button className="btn btn--ghost" disabled={busy !== null}>
            {busy === 'preview' ? 'Reading…' : 'Preview'}
          </button>
          {preview && (
            <button type="button" className="btn btn--accent" disabled={busy !== null} onClick={() => send(true)}>
              {busy === 'save' ? 'Saving…' : saveLabel}
            </button>
          )}
        </div>

        {preview?.kind === 'topics' && (
          <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
            <p>
              <strong>{preview.topics.length} topics</strong>{' '}
              <span className={styles.dim}>
                for {preview.subject} · {preview.title}, from {preview.sourceName}
              </span>
            </p>
            {preview.topics.some((t) => !t.found) && (
              <p className="notice">
                Not in that list, so they’ll be skipped: {preview.topics.filter((t) => !t.found).map((t) => t.name).join(', ')}
              </p>
            )}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Topic</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.topics.map((t) => (
                    <tr key={t.name} style={t.found ? undefined : { opacity: 0.5 }}>
                      <th>{t.name}</th>
                      <td>{t.topic}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {preview?.kind === 'groups' && (
          <div style={{ marginTop: 18, display: 'grid', gap: 12 }}>
            <p>
              <strong>
                {preview.groups.length} groups, {total} roll numbers
              </strong>{' '}
              <span className={styles.dim}>from {preview.sourceName}</span>
            </p>
            {preview.unknown.length > 0 && (
              <p className="notice">Not on the roster, so they’ll be left out: {preview.unknown.join(', ')}</p>
            )}
            {preview.duplicates.length > 0 && (
              <p className="notice">In more than one group (kept in the first only): {preview.duplicates.join(', ')}</p>
            )}
            {preview.ignoredRows > 0 && <p className={styles.dim}>{preview.ignoredRows} rows had no roll number and were skipped.</p>}
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Group</th>
                    <th>Topic</th>
                    <th>Members</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.groups.map((g) => (
                    <tr key={g.name}>
                      <th>{g.name}</th>
                      <td>{g.topic ?? '—'}</td>
                      <td>
                        {g.members.map((m) => (
                          <div key={m.rollNo} style={m.name ? undefined : { textDecoration: 'line-through', opacity: 0.6 }}>
                            {m.name ?? m.rollNo}
                            {m.name && <span className={styles.dim}> · {m.rollNo}</span>}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </form>

      <section className={styles.panel} aria-labelledby="sets-title">
        <h2 id="sets-title" className={styles.panelTitle}>
          Live group lists
        </h2>
        {sets.length === 0 ? (
          <p className={styles.dim}>None yet.</p>
        ) : (
          <ul style={list}>
            {sets.map((s) => (
              <li key={s.id} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <span style={{ flex: 1 }}>
                  <strong>
                    {s.subject} · {s.title}
                  </strong>
                  <br />
                  <span className={styles.dim}>
                    {s.groups} groups · {s.students} students · updated{' '}
                    {new Date(s.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </span>
                </span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => remove(s)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
