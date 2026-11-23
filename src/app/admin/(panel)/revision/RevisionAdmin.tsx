'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api } from '@/lib/client-api';
import { formatDay } from '@/lib/time';
import { splitKeyPoints, type RevisionMode, type RevisionSettings } from '@/lib/revision/model';
import type { RevisionQuestion } from '@/lib/revision/repo';
import styles from '../../admin.module.css';

const KNOWN_SUBJECTS = ['BRM', 'CF', 'DMA', 'DT', 'MM2', 'OM', 'SM', 'TOD'];

const BULK_EXAMPLE = `Subject: SM
Title: Five forces for a D2C skincare brand
Minutes: 15
Marks: 10
Question:
A D2C skincare brand wants to enter tier-2 cities. Use Porter's five forces to advise it.
Model answer:
Start with the industry's attractiveness…
Key points:
- Threat of new entrants is high (low capital, Instagram reach)
- Buyer power is high: low switching costs
- Recommendation tied to the analysis
---
Subject: CF
Title: …`;

type Props = {
  settings: RevisionSettings;
  openNow: boolean;
  questions: RevisionQuestion[];
  activity: Record<string, { started: number; nailed: number }>;
};

export function RevisionAdmin({ settings, openNow, questions, activity }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState<RevisionMode>(settings.mode);
  const [opensOn, setOpensOn] = useState(settings.opensOn);
  const [editing, setEditing] = useState<RevisionQuestion | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const say = (text: string, ok = true) => setMsg({ text, ok });

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setBusy('settings');
    const res = await api('/api/admin/revision/settings', { mode, opensOn });
    setBusy(null);
    if (!res.ok) return say(res.error, false);
    say('Saved when students can see revision.');
    router.refresh();
  }

  async function saveQuestion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const question = {
      subject: d.get('subject'),
      title: d.get('title'),
      minutes: d.get('minutes'),
      marks: d.get('marks'),
      prompt: d.get('prompt'),
      modelAnswer: d.get('modelAnswer'),
      keyPoints: splitKeyPoints(String(d.get('keyPoints') ?? '')),
    };
    setBusy('question');
    const res = editing
      ? await api(`/api/admin/revision/${editing.id}`, { question }, 'PUT')
      : await api('/api/admin/revision', { question });
    setBusy(null);
    if (!res.ok) return say(res.error, false);
    say(editing ? 'Question updated.' : 'Question added.');
    setEditing(null);
    setFormKey((k) => k + 1); // fresh, empty form
    router.refresh();
  }

  async function addBulk(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const d = new FormData(form);
    setBusy('bulk');
    const res = await api<{ added: number }>('/api/admin/revision', { bulk: d.get('bulk'), subject: d.get('subject') });
    setBusy(null);
    if (!res.ok) return say(res.error, false);
    form.reset();
    say(`${res.data.added} ${res.data.added === 1 ? 'question' : 'questions'} added.`);
    router.refresh();
  }

  async function remove(q: RevisionQuestion) {
    // An in-page second click instead of confirm(), which some browsers and embedded views block.
    if (confirmDelete !== q.id) return setConfirmDelete(q.id);
    setConfirmDelete(null);
    const res = await api(`/api/admin/revision/${q.id}`, undefined, 'DELETE');
    if (!res.ok) return say(res.error, false);
    if (editing?.id === q.id) setEditing(null);
    say(`Deleted “${q.title}”.`);
    router.refresh();
  }

  function startEdit(q: RevisionQuestion) {
    setEditing(q);
    setFormKey((k) => k + 1);
    setMsg(null);
    requestAnimationFrame(() => document.getElementById('revision-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const bySubject = new Map<string, RevisionQuestion[]>();
  for (const q of questions) bySubject.set(q.subject, [...(bySubject.get(q.subject) ?? []), q]);
  const subjects = [...new Set([...KNOWN_SUBJECTS, ...bySubject.keys()])].sort();

  const visibility =
    settings.mode === 'on'
      ? 'Students can see it now.'
      : settings.mode === 'off'
        ? 'Hidden from students.'
        : openNow
          ? `Open to students since ${formatDay(settings.opensOn, true)}.`
          : `Hidden from students until ${formatDay(settings.opensOn, true)}.`;

  return (
    <>
      {msg && (
        <p className={`notice ${msg.ok ? 'notice--ok' : 'notice--warn'}`} role={msg.ok ? 'status' : 'alert'}>
          {msg.text}
        </p>
      )}

      <form className={styles.panel} onSubmit={saveSettings} aria-labelledby="rev-vis">
        <h2 className={styles.panelTitle} id="rev-vis">
          When students see it
        </h2>
        <p className={styles.dim} data-testid="revision-visibility">
          {visibility} You can always try it yourself at <Link href="/revision">/revision</Link> while signed in as admin.
        </p>
        <fieldset style={{ border: 0, padding: 0, margin: '12px 0 0', display: 'grid', gap: 10 }}>
          <legend className="sr-only">Visibility</legend>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <label className="check">
              <input type="radio" name="mode" value="auto" checked={mode === 'auto'} onChange={() => setMode('auto')} />
              <span>Open on a date</span>
            </label>
            {/* Outside the label: .check styles every input inside it as a 20px box. */}
            <input
              className="input"
              type="date"
              aria-label="Opening date"
              value={opensOn}
              required
              onChange={(e) => {
                setOpensOn(e.target.value);
                setMode('auto');
              }}
              style={{ width: 'auto' }}
            />
          </span>
          <label className="check">
            <input type="radio" name="mode" value="on" checked={mode === 'on'} onChange={() => setMode('on')} />
            <span>Open now</span>
          </label>
          <label className="check">
            <input type="radio" name="mode" value="off" checked={mode === 'off'} onChange={() => setMode('off')} />
            <span>Hidden</span>
          </label>
        </fieldset>
        <div className={styles.actions}>
          <button className="btn btn--accent" disabled={busy !== null}>
            {busy === 'settings' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>

      <form key={formKey} id="revision-form" className={styles.panel} onSubmit={saveQuestion}>
        <h2 className={styles.panelTitle}>{editing ? `Edit “${editing.title}”` : 'Add a question'}</h2>
        <div className={styles.row3}>
          <label className="field">
            <span className="label">Subject</span>
            <input className="input" name="subject" required maxLength={40} list="revision-subjects" defaultValue={editing?.subject ?? ''} placeholder="e.g. SM" />
          </label>
          <label className="field">
            <span className="label">Time to write (minutes)</span>
            <input className="input" name="minutes" type="number" min={1} max={180} required defaultValue={editing?.minutes ?? 15} />
          </label>
          <label className="field">
            <span className="label">Marks (optional)</span>
            <input className="input" name="marks" type="number" min={1} max={100} defaultValue={editing?.marks ?? ''} />
          </label>
        </div>
        <datalist id="revision-subjects">
          {subjects.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <label className="field">
          <span className="label">Short title</span>
          <input className="input" name="title" required maxLength={160} defaultValue={editing?.title ?? ''} placeholder="e.g. Five forces for a D2C brand" />
        </label>
        <label className="field">
          <span className="label">Question or case</span>
          <textarea className="textarea" name="prompt" required rows={6} maxLength={12000} defaultValue={editing?.prompt ?? ''} />
        </label>
        <label className="field">
          <span className="label">Model answer</span>
          <textarea className="textarea" name="modelAnswer" required rows={8} maxLength={20000} defaultValue={editing?.modelAnswer ?? ''} />
        </label>
        <label className="field">
          <span className="label">Key points (one per line; students tick the ones they covered)</span>
          <textarea className="textarea" name="keyPoints" rows={5} defaultValue={editing?.keyPoints.join('\n') ?? ''} />
        </label>
        <div className={styles.actions}>
          <button className="btn btn--accent" disabled={busy !== null}>
            {busy === 'question' ? 'Saving…' : editing ? 'Save changes' : 'Add question'}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setEditing(null);
                setFormKey((k) => k + 1);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <form className={styles.panel} onSubmit={addBulk}>
        <h2 className={styles.panelTitle}>Paste several questions</h2>
        <p className={styles.dim}>
          Separate questions with a line of three dashes (<code>---</code>). Each needs a Question and a Model answer; Title, Minutes (default 15),
          Marks and Key points are optional. The whole paste is added only if every question reads correctly.
        </p>
        <details>
          <summary className={styles.dim} style={{ cursor: 'pointer' }}>
            Show the format
          </summary>
          <pre className={styles.mono} style={{ whiteSpace: 'pre-wrap', fontSize: 13, margin: '8px 0 0' }}>
            {BULK_EXAMPLE}
          </pre>
        </details>
        <label className="field">
          <span className="label">Subject for questions without one (optional)</span>
          <input className="input" name="subject" maxLength={40} list="revision-subjects" style={{ maxWidth: 200 }} />
        </label>
        <label className="field">
          <span className="label">Questions</span>
          <textarea className="textarea" name="bulk" required rows={10} placeholder={BULK_EXAMPLE} />
        </label>
        <div className={styles.actions}>
          <button className="btn btn--accent" disabled={busy !== null}>
            {busy === 'bulk' ? 'Adding…' : 'Add all'}
          </button>
        </div>
      </form>

      <section className={styles.panel} aria-labelledby="rev-list">
        <h2 className={styles.panelTitle} id="rev-list">
          Questions <span className="count tabular">({questions.length})</span>
        </h2>
        {questions.length === 0 ? (
          <p className={styles.dim}>No questions yet. Add one above or paste a batch.</p>
        ) : (
          [...bySubject.entries()].map(([subject, items]) => (
            <div key={subject} style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 15, margin: '0 0 8px' }}>
                {subject} <span className="count tabular">({items.length})</span>
              </h3>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 10 }}>
                {items.map((q) => {
                  const a = activity[q.id];
                  return (
                    <li key={q.id} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }} data-testid="revision-admin-item">
                      <span style={{ flex: '1 1 240px' }}>
                        <strong>{q.title}</strong>
                        <br />
                        <span className={styles.dim}>
                          {q.minutes} min{q.marks ? ` · ${q.marks} marks` : ''} · {q.keyPoints.length} key {q.keyPoints.length === 1 ? 'point' : 'points'}
                          {a ? ` · started by ${a.started}, nailed by ${a.nailed}` : ''}
                        </span>
                      </span>
                      <button type="button" className="btn btn--ghost btn--sm" onClick={() => startEdit(q)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className={`btn btn--sm ${confirmDelete === q.id ? 'btn--danger' : 'btn--ghost'}`}
                        onClick={() => remove(q)}
                        onBlur={() => setConfirmDelete((c) => (c === q.id ? null : c))}
                      >
                        {confirmDelete === q.id ? 'Confirm delete' : 'Delete'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </section>
    </>
  );
}
