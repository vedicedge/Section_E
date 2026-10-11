'use client';

import { useRouter } from 'next/navigation';
import { Fragment, useState } from 'react';
import { api } from '@/lib/client-api';
import type { PlanRecord } from '@/lib/seating/repo';
import styles from '../../admin.module.css';

function PlanEditor({ plan, onDone }: { plan: PlanRecord; onDone: () => void }) {
  const router = useRouter();
  const [code, setCode] = useState(plan.code);
  const [title, setTitle] = useState(plan.title);
  const [kind, setKind] = useState(plan.kind);
  const [room, setRoom] = useState(plan.room ?? '');
  const [aliases, setAliases] = useState(plan.aliases.join(', '));
  const [validFrom, setValidFrom] = useState(plan.validFrom ?? '');
  const [validTo, setValidTo] = useState(plan.validTo ?? '');
  const [notes, setNotes] = useState(plan.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className={styles.stack} style={{ gap: 12, padding: '12px 0' }}>
      <div className={styles.row3}>
        <label className="field">
          <span>Code</span>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} />
        </label>
        <label className="field">
          <span>Subject title</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Type</span>
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as 'class' | 'exam')}>
            <option value="class">Class</option>
            <option value="exam">Exam</option>
          </select>
        </label>
      </div>
      <div className={styles.row3}>
        <label className="field">
          <span>Room</span>
          <input className="input" value={room} onChange={(e) => setRoom(e.target.value)} />
        </label>
        <label className="field">
          <span>Valid from</span>
          <input className="input" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
        </label>
        <label className="field">
          <span>Valid until</span>
          <input className="input" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Timetable aliases (comma-separated)</span>
        <input className="input" value={aliases} onChange={(e) => setAliases(e.target.value)} placeholder="e.g. Corp Fin, CF-II" />
        <span className="hint">Extra names this subject goes by in the timetable, so classes are matched to this seating plan.</span>
      </label>
      <label className="field">
        <span>Note shown to students (optional)</span>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Row 1 is nearest the board" />
      </label>
      <div className={styles.actions}>
        <button
          className="btn btn--sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            const res = await api(
              `/api/admin/seating/${plan.id}`,
              {
                code,
                title,
                kind,
                room: room.trim() || null,
                aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
                validFrom: validFrom || null,
                validTo: validTo || null,
                notes: notes.trim() || null,
              },
              'PATCH',
            );
            setBusy(false);
            if (!res.ok) return setError(res.error);
            onDone();
            router.refresh();
          }}
        >
          Save
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onDone}>
          Cancel
        </button>
        {error && <span className="hint" style={{ color: 'var(--accent)' }}>{error}</span>}
      </div>
    </div>
  );
}

export function PlanTable({ plans }: { plans: PlanRecord[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);

  if (!plans.length) {
    return (
      <div className={styles.emptyBox}>
        <strong>No seating plans yet.</strong>
        Upload the workbook above — the roster students register against is created from it.
      </div>
    );
  }

  return (
    <section className={styles.stack} style={{ gap: 12 }} aria-labelledby="current">
      <h2 id="current" className={styles.panelTitle}>
        Current plans
      </h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Subject</th>
              <th scope="col">Type</th>
              <th scope="col">Room</th>
              <th scope="col">Valid</th>
              <th scope="col">Students</th>
              <th scope="col">Visible</th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <th scope="row">{p.code}</th>
                  <td>
                    {p.title}
                    {p.aliases.length > 0 && <div className="dim" style={{ fontSize: 12 }}>aka {p.aliases.join(', ')}</div>}
                  </td>
                  <td>{p.kind === 'exam' ? <span className="pill pill--warn">Exam</span> : 'Class'}</td>
                  <td>{p.room ?? <span className="dim">—</span>}</td>
                  <td className="dim" style={{ fontSize: 13 }}>
                    {p.validFrom || p.validTo ? `${p.validFrom ?? '…'} → ${p.validTo ?? '…'}` : 'Always'}
                  </td>
                  <td className={styles.mono}>{p.assigned}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={p.active}
                      aria-label={`${p.code} visible to students`}
                      onChange={async (e) => {
                        await api(`/api/admin/seating/${p.id}`, { active: e.target.checked }, 'PATCH');
                        router.refresh();
                      }}
                    />
                  </td>
                  <td>
                    <div className={styles.actions} style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn--ghost btn--sm" onClick={() => setEditing(editing === p.id ? null : p.id)}>
                        Edit
                      </button>
                      <button
                        className="btn btn--danger btn--sm"
                        onClick={async () => {
                          if (!confirm(`Delete the ${p.code} seating plan?`)) return;
                          await api(`/api/admin/seating/${p.id}`, undefined, 'DELETE');
                          router.refresh();
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                {editing === p.id && (
                  <tr>
                    <td colSpan={8}>
                      <PlanEditor plan={p} onDone={() => setEditing(null)} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
