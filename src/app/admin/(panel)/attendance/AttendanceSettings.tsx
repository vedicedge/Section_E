'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '@/lib/client-api';
import {
  DEFAULT_MIN_PERCENT,
  HEART_PATH,
  MAX_SESSIONS,
  configKeys,
  formatPercent,
  requiredOf,
  type AttendanceConfig,
} from '@/lib/attendance/calc';
// Type-only: repo.ts is server-only, so nothing from it may reach the client bundle.
import type { AttendanceConfigInput } from '@/lib/attendance/repo';
import type { SubjectOption } from '@/lib/homework/repo';
import { subjectKey } from '@/lib/names';
import styles from '../../admin.module.css';
import css from './attendance.module.css';

const MAX_SUBJECTS = 30;
const MAX_ALIASES = 6;
const MAX_CODE = 20;
const MAX_TERM_LABEL = 40;

type Status = { kind: 'ok' | 'error'; text: string; reload?: boolean } | null;

/** One editable subject row. `key` is local (React); `id` is the stored, stable id (null when new). */
interface Row {
  key: string;
  id: string | null;
  code: string;
  title: string;
  total: string;
  aliases: string;
}

interface Draft {
  enabled: boolean;
  minPercent: string;
  termLabel: string;
  rows: Row[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function toDraft(config: AttendanceConfig): Draft {
  return {
    enabled: config.enabled,
    minPercent: String(config.minPercent),
    termLabel: config.termLabel,
    rows: config.subjects.map((s) => ({ key: s.id, id: s.id, code: s.code, title: s.title, total: String(s.total), aliases: s.aliases.join(', ') })),
  };
}

const aliasList = (text: string) =>
  text
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);

function parseTotal(text: string): number | null {
  const t = text.trim();
  if (!/^\d{1,3}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= MAX_SESSIONS ? n : null;
}

function parsePercent(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 50 && n <= 100 ? n : null;
}

/** For the dirty check: what would actually be saved. */
function serialise(d: Draft): string {
  return JSON.stringify([
    d.enabled,
    d.minPercent.trim(),
    d.termLabel.trim(),
    d.rows.map((r) => [r.id, r.code.trim(), r.title.trim(), r.total.trim(), aliasList(r.aliases)]),
  ]);
}

function heartsOf(total: number, minPercent: number): { required: number; hearts: number } {
  const required = Math.min(total, requiredOf(total, minPercent));
  return { required, hearts: total - required };
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

const sortedLetters = (s: string) => [...s].sort().join('');

function HeartMark() {
  return (
    <svg className={css.heart} viewBox="0 0 48 44" width="12" height="11" aria-hidden="true" focusable="false">
      <path d={HEART_PATH} />
    </svg>
  );
}

interface Props {
  initial: AttendanceConfig;
  /** app_settings.updated_at as text — sent back unchanged as the optimistic-lock base. */
  updatedAt: string | null;
  /** Class seating plans, for titles, next-class matching and the "add from plans" chips. */
  plans: SubjectOption[];
}

export function AttendanceSettings({ initial, updatedAt, plans }: Props) {
  const router = useRouter();
  const uid = useId();
  const [saved, setSaved] = useState<Draft>(() => toDraft(initial));
  const [draft, setDraft] = useState<Draft>(saved);
  const [base, setBase] = useState<string | null>(updatedAt);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [reloading, setReloading] = useState(false);
  const [propsSeen, setPropsSeen] = useState(updatedAt);
  const nextKey = useRef(0);
  const focusNext = useRef<string | null>(null);

  const dirty = serialise(draft) !== serialise(saved);

  // New server props (after a save, a Reload or another admin's change): take them unless that
  // would throw away edits the admin hasn't saved yet.
  if (updatedAt !== propsSeen) {
    setPropsSeen(updatedAt);
    if (!dirty || reloading) {
      const fresh = toDraft(initial);
      setSaved(fresh);
      setDraft(fresh);
      setBase(updatedAt);
      setReloading(false);
      if (reloading) setStatus(null);
    }
  }

  useEffect(() => {
    if (!focusNext.current) return;
    document.getElementById(focusNext.current)?.focus();
    focusNext.current = null;
  });

  const fieldId = (key: string, field: string) => `${uid}-${key}-${field}`;
  const minPercent = parsePercent(draft.minPercent);
  const pct = minPercent ?? (parsePercent(saved.minPercent) ?? DEFAULT_MIN_PERCENT);
  const savedPct = parsePercent(saved.minPercent) ?? DEFAULT_MIN_PERCENT;
  const pctText = formatPercent(pct);

  /* ---------------------------------------------------------- derived */

  const planInfo = plans.map((p) => ({ ...p, key: subjectKey(p.code), titleKey: subjectKey(p.title) }));
  const planKeys = new Set(planInfo.map((p) => p.key));
  const rowKeys = draft.rows.map((r) => configKeys({ code: r.code, aliases: aliasList(r.aliases) }));
  const usedKeys = new Set(rowKeys.flat());
  const savedById = new Map(saved.rows.map((r) => [r.id, r]));

  const problems: string[] = [];
  const notes: string[] = [];
  const renames: string[] = [];

  if (minPercent === null) problems.push('Minimum attendance must be a number from 50 to 100.');
  if (draft.termLabel.trim().length > MAX_TERM_LABEL) problems.push(`The term label can be at most ${MAX_TERM_LABEL} characters.`);
  if (draft.rows.length > MAX_SUBJECTS) problems.push(`At most ${MAX_SUBJECTS} subjects.`);

  const owner = new Map<string, number>();
  const reported = new Set<string>();
  let hearts = 0;
  let counted = 0;
  const derived = draft.rows.map((row, i) => {
    const code = row.code.trim();
    const label = code || `Subject ${i + 1}`;
    const total = parseTotal(row.total);
    const aliases = aliasList(row.aliases);
    if (!code) problems.push(`Subject ${i + 1} needs a code.`);
    else if (code.length > MAX_CODE) problems.push(`${label}: a code can be at most ${MAX_CODE} characters.`);
    else if (!subjectKey(code)) problems.push(`${label}: a code needs at least one letter or digit.`);
    if (total === null) problems.push(`${label}: sessions must be a whole number from 1 to ${MAX_SESSIONS}.`);
    if (aliases.length > MAX_ALIASES || aliases.some((a) => a.length > MAX_CODE)) {
      problems.push(`${label}: at most ${MAX_ALIASES} extra labels, each up to ${MAX_CODE} characters.`);
    }
    for (const key of rowKeys[i]!) {
      const j = owner.get(key);
      if (j !== undefined && j !== i) {
        const pair = `${j}:${i}`;
        if (!reported.has(pair)) {
          reported.add(pair);
          problems.push(`${draft.rows[j]!.code.trim()} and ${code} are the same subject.`);
        }
      } else owner.set(key, i);
    }
    // A new row takes subjectKey(code) as its id; it can't take one another row still holds.
    if (!row.id && code) {
      const clash = draft.rows.find((o) => o !== row && o.id && o.id === subjectKey(code));
      if (clash) problems.push(`${code} clashes with ${clash.code.trim()} — pick another code.`);
    }

    const math = total === null ? null : heartsOf(total, pct);
    if (math) {
      hearts += math.hearts;
      counted++;
      if (math.hearts === 0 && code) notes.push(`${code}: ${plural(total!, 'session')} leave no hearts at ${pctText}% (every class counts).`);
    }

    const keys = rowKeys[i]!;
    const plan =
      planInfo.find((p) => keys.includes(p.key)) ?? (row.title.trim() ? planInfo.find((p) => p.titleKey && p.titleKey === subjectKey(row.title)) : undefined);
    if (code && planInfo.length > 0 && !plan) {
      const unused = planInfo.filter((p) => !usedKeys.has(p.key));
      const suggestion =
        unused.find((p) => keys.some((k) => sortedLetters(k) === sortedLetters(p.key))) ?? unused.find((p) => keys.some((k) => levenshtein(k, p.key) <= 1));
      notes.push(
        `${code} doesn’t match a class seating plan — no title or next-class times.` +
          (suggestion ? ` Did you mean ${suggestion.code}? Add ${suggestion.code} under “Also matches”.` : ''),
      );
    }

    const before = row.id ? savedById.get(row.id) : undefined;
    if (before && code && before.code.trim() !== code) renames.push(`Renamed ${before.code.trim()} → ${code}: students’ counts stay with it.`);

    return { label, math, plan: planInfo.find((p) => keys.includes(p.key)) ?? null };
  });

  const chips = planInfo.filter((p, i) => p.key && !usedKeys.has(p.key) && planInfo.findIndex((q) => q.key === p.key) === i);

  /* ---------------------------------------------------------- editing */

  function patchRow(key: string, patch: Partial<Row>) {
    setDraft((d) => ({ ...d, rows: d.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));
  }

  function addRow(row: Omit<Row, 'key' | 'id'>, focus: 'code' | 'total') {
    const key = `new-${++nextKey.current}`;
    focusNext.current = fieldId(key, focus);
    setDraft((d) => ({ ...d, rows: [...d.rows, { key, id: null, ...row }] }));
  }

  function move(index: number, by: -1 | 1) {
    setDraft((d) => {
      const rows = [...d.rows];
      const j = index + by;
      if (j < 0 || j >= rows.length) return d;
      [rows[index], rows[j]] = [rows[j]!, rows[index]!];
      return { ...d, rows };
    });
  }

  function remove(row: Row) {
    const code = row.code.trim() || 'this subject';
    // Counts are keyed by the subject's original code (its id), which a rename doesn't change.
    const restoreAs = row.id && subjectKey(code) !== row.id ? row.id : code;
    if (
      row.id &&
      savedById.has(row.id) &&
      !confirm(`Remove ${code}? Students’ ${code} counts are kept, hidden, and come back if you add a subject coded ${restoreAs} again.`)
    )
      return;
    setDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.key !== row.key) }));
  }

  /** "OM: 20 → 22 sessions (hearts 4 → 4)" for every saved subject whose numbers change. */
  function changeSummary(): string[] {
    const lines: string[] = [];
    if (pct !== savedPct) lines.push(`Minimum attendance: ${formatPercent(savedPct)}% → ${pctText}%`);
    for (const row of draft.rows) {
      const before = row.id ? savedById.get(row.id) : undefined;
      const now = parseTotal(row.total);
      const was = before ? parseTotal(before.total) : null;
      if (!before || now === null || was === null) continue;
      const h0 = heartsOf(was, savedPct).hearts;
      const h1 = heartsOf(now, pct).hearts;
      if (now !== was) lines.push(`${row.code.trim()}: ${was} → ${now} sessions (hearts ${h0} → ${h1})`);
      else if (h0 !== h1) lines.push(`${row.code.trim()}: ${now} sessions (hearts ${h0} → ${h1})`);
    }
    return lines;
  }

  async function save() {
    if (problems.length || busy) return;
    const totalsChanged = pct !== savedPct || draft.rows.some((r) => r.id && savedById.has(r.id) && savedById.get(r.id)!.total.trim() !== r.total.trim());
    if (totalsChanged) {
      const lines = changeSummary();
      if (lines.length && !confirm(`${lines.join('\n')}\nStudents using the class count follow these numbers straight away.`)) return;
    }
    const payload: AttendanceConfigInput & { baseUpdatedAt: string | null } = {
      baseUpdatedAt: base,
      enabled: draft.enabled,
      minPercent: pct,
      termLabel: draft.termLabel.trim(),
      subjects: draft.rows.map((r) => ({
        id: r.id,
        code: r.code.trim(),
        title: r.title.trim(),
        total: parseTotal(r.total)!,
        aliases: aliasList(r.aliases),
      })),
    };
    setBusy(true);
    setStatus(null);
    const res = await api<{ config: AttendanceConfig; updatedAt: string | null }>('/api/admin/attendance', payload, 'PUT');
    setBusy(false);
    if (!res.ok) {
      setStatus({ kind: 'error', text: res.error, reload: res.status === 409 });
      return;
    }
    const fresh = toDraft(res.data.config);
    setSaved(fresh);
    setDraft(fresh);
    setBase(res.data.updatedAt);
    setStatus({ kind: 'ok', text: 'Saved — students see it straight away.' });
    router.refresh();
  }

  function discard() {
    setDraft(saved);
    setStatus(null);
  }

  /* ---------------------------------------------------------- render */

  const example = heartsOf(14, pct);

  return (
    <>
      <input type="hidden" name="updatedAt" value={base ?? ''} data-updated-at={base ?? ''} />

      <section className={styles.panel} aria-labelledby={`${uid}-rule`}>
        <h2 id={`${uid}-rule`} className={styles.panelTitle}>
          The rule
        </h2>
        <label className="check">
          <input type="checkbox" checked={draft.enabled} onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))} />
          Show the Attendance tab to students
        </label>
        <div className={styles.row2}>
          <label className="field">
            <span>Minimum attendance</span>
            <span className={css.suffixed}>
              <input
                className="input"
                type="number"
                inputMode="decimal"
                min={50}
                max={100}
                step={0.5}
                value={draft.minPercent}
                aria-invalid={minPercent === null || undefined}
                onChange={(e) => setDraft((d) => ({ ...d, minPercent: e.target.value }))}
              />
              <span className={css.suffix} aria-hidden="true">
                %
              </span>
            </span>
          </label>
          <label className="field">
            <span>Term label</span>
            <input
              className="input"
              type="text"
              maxLength={MAX_TERM_LABEL}
              value={draft.termLabel}
              placeholder="Term II"
              onChange={(e) => setDraft((d) => ({ ...d, termLabel: e.target.value }))}
            />
          </label>
        </div>
        <p className="hint" aria-live="polite">
          At {pctText}%: 14 sessions → attend {example.required} → {plural(example.hearts, 'heart')}.
        </p>
      </section>

      <section className={styles.panel} aria-labelledby={`${uid}-subjects`}>
        <h2 id={`${uid}-subjects`} className={styles.panelTitle}>
          Subjects
        </h2>
        {draft.rows.length === 0 ? (
          <div className={styles.emptyBox}>
            <strong>No subjects yet.</strong>
            Students see “The term isn’t set up yet” until you add one.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={`${styles.table} ${css.table}`}>
              <caption className="sr-only">Subjects students count leaves for, in the order they see them</caption>
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Title</th>
                  <th scope="col">Sessions</th>
                  <th scope="col">Also matches</th>
                  <th scope="col">Attend</th>
                  <th scope="col">Hearts</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {draft.rows.map((row, i) => {
                  const d = derived[i]!;
                  return (
                    <tr key={row.key}>
                      <td data-label="Code">
                        <input
                          id={fieldId(row.key, 'code')}
                          className={`input ${css.code}`}
                          type="text"
                          maxLength={MAX_CODE}
                          autoComplete="off"
                          spellCheck={false}
                          value={row.code}
                          aria-label={`Subject ${i + 1} code`}
                          onChange={(e) => patchRow(row.key, { code: e.target.value })}
                        />
                      </td>
                      <td data-label="Title">
                        <input
                          className="input"
                          type="text"
                          maxLength={120}
                          value={row.title}
                          placeholder={d.plan ? `${d.plan.title} — from seating plan` : 'Optional'}
                          aria-label={`Title for ${d.label}`}
                          onChange={(e) => patchRow(row.key, { title: e.target.value })}
                        />
                      </td>
                      <td data-label="Sessions">
                        <input
                          id={fieldId(row.key, 'total')}
                          className={`input ${css.num}`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={MAX_SESSIONS}
                          step={1}
                          value={row.total}
                          aria-label={`Sessions for ${d.label}`}
                          aria-invalid={d.math === null || undefined}
                          onChange={(e) => patchRow(row.key, { total: e.target.value })}
                        />
                      </td>
                      <td data-label="Also matches">
                        <input
                          className="input"
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          value={row.aliases}
                          placeholder="e.g. DAM, MM-2"
                          aria-label={`Also matches for ${d.label} (comma-separated)`}
                          onChange={(e) => patchRow(row.key, { aliases: e.target.value })}
                        />
                      </td>
                      <td data-label="Attend" className={styles.mono}>
                        {d.math ? d.math.required : '—'}
                      </td>
                      <td data-label="Hearts" className={styles.mono}>
                        {d.math ? (
                          <span className={css.hearts}>
                            <HeartMark />
                            {d.math.hearts}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={css.rowActions}>
                        <button
                          type="button"
                          className={`btn btn--ghost btn--sm ${css.icon}`}
                          aria-label={`Move ${d.label} up`}
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={`btn btn--ghost btn--sm ${css.icon}`}
                          aria-label={`Move ${d.label} down`}
                          disabled={i === draft.rows.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          ↓
                        </button>
                        <button type="button" className="btn btn--danger btn--sm" aria-label={`Remove ${d.label}`} onClick={() => remove(row)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className={styles.actions}>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={draft.rows.length >= MAX_SUBJECTS}
            onClick={() => addRow({ code: '', title: '', total: '20', aliases: '' }, 'code')}
          >
            + Add subject
          </button>
        </div>

        {chips.length > 0 && (
          <div className={css.chipsBlock}>
            <p className="label" id={`${uid}-chips`}>
              Add from seating plans
            </p>
            <ul className={css.chips} aria-labelledby={`${uid}-chips`}>
              {chips.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    className={css.chip}
                    title={p.title}
                    aria-label={`Add ${p.code}`}
                    disabled={draft.rows.length >= MAX_SUBJECTS}
                    onClick={() => addRow({ code: p.code, title: '', total: '20', aliases: '' }, 'total')}
                  >
                    + {p.code}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className={css.sum}>
          {plural(hearts, 'heart')} across {plural(counted, 'subject')} at {pctText}%
        </p>

        {(problems.length > 0 || notes.length > 0) && (
          <ul className={styles.warnList} aria-live="polite">
            {problems.map((p) => (
              <li key={`p-${p}`}>{p}</li>
            ))}
            {notes.map((n) => (
              <li key={`n-${n}`}>{n}</li>
            ))}
          </ul>
        )}
        {renames.length > 0 && (
          <ul className={`hint ${css.renames}`}>
            {renames.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </section>

      <div aria-live="polite" aria-atomic="true">
        {status && (
          <div className={`notice ${status.kind === 'ok' ? 'notice--ok' : ''} ${css.status}`}>
            <span>{status.text}</span>
            {status.reload && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setReloading(true);
                  router.refresh();
                }}
              >
                Reload
              </button>
            )}
          </div>
        )}
      </div>

      {dirty && (
        <div className={css.saveBar} role="region" aria-label="Unsaved changes">
          <span className={css.saveText}>
            Unsaved changes{problems.length > 0 && <span className={styles.dim}> · fix the notes above to save</span>}
          </span>
          <span className={styles.actions}>
            <button type="button" className="btn btn--accent btn--sm" onClick={save} disabled={busy || problems.length > 0}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={discard} disabled={busy}>
              Discard
            </button>
          </span>
        </div>
      )}
    </>
  );
}

/** "New term": wipes every student's counts. Subjects and the rule stay. */
export function NewTermPanel() {
  const router = useRouter();
  const uid = useId();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function reset() {
    if (typed !== 'RESET' || busy) return;
    setBusy(true);
    setStatus(null);
    const res = await api<{ deleted: number }>('/api/admin/attendance/reset', { confirm: 'RESET' });
    setBusy(false);
    if (!res.ok) return setStatus({ kind: 'error', text: res.error });
    setTyped('');
    setStatus({ kind: 'ok', text: `Cleared ${plural(res.data.deleted, 'saved count')}.` });
    router.refresh();
  }

  return (
    <section className={styles.panel} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className={styles.panelTitle}>
        New term
      </h2>
      <form
        className={css.resetRow}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          reset();
        }}
      >
        <label className="field">
          <span>Clear every student’s hearts</span>
          <input
            className="input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            placeholder="RESET"
            aria-describedby={`${uid}-help`}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
        <button type="submit" className="btn btn--danger" disabled={typed !== 'RESET' || busy}>
          {busy ? 'Clearing…' : 'Clear every student’s hearts'}
        </button>
      </form>
      <p id={`${uid}-help`} className="hint">
        Subjects stay; every student’s counts, totals and ‘held so far’ are deleted. Type RESET to confirm.
      </p>
      <div aria-live="polite" aria-atomic="true">
        {status && <p className={`notice ${status.kind === 'ok' ? 'notice--ok' : ''}`}>{status.text}</p>}
      </div>
    </section>
  );
}
