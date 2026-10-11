'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api } from '@/lib/client-api';
import { formatDateTime } from '@/lib/time';
import type { RosterEntry } from '@/lib/students';
import styles from '../../admin.module.css';

export function Roster({ roster }: { roster: RosterEntry[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'registered' | 'pending'>('all');
  const [roll, setRoll] = useState('');
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return roster.filter(
      (r) =>
        (filter === 'all' || (filter === 'registered' ? r.registered : !r.registered)) &&
        (!needle || r.rollNo.toLowerCase().includes(needle) || r.name.toLowerCase().includes(needle)),
    );
  }, [roster, q, filter]);

  async function act(rollNo: string, action: 'reset' | 'activate' | 'deactivate' | 'delete') {
    if (action === 'reset' && !confirm(`Reset ${rollNo}? Their PIN is cleared and they must register again.`)) return;
    if (action === 'delete' && !confirm(`Remove ${rollNo} from the roster?`)) return;
    setBusy(rollNo);
    const res =
      action === 'delete'
        ? await api(`/api/admin/students/${encodeURIComponent(rollNo)}`, undefined, 'DELETE')
        : await api(`/api/admin/students/${encodeURIComponent(rollNo)}`, { action }, 'PATCH');
    setBusy(null);
    setMessage(res.ok ? null : res.error);
    router.refresh();
  }

  return (
    <>
      <form
        className={styles.panel}
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await api('/api/admin/students', { rollNo: roll, name });
          if (!res.ok) return setMessage(res.error);
          setRoll('');
          setName('');
          setMessage(null);
          router.refresh();
        }}
      >
        <h2 className={styles.panelTitle}>Add a student</h2>
        <div className={styles.row3} style={{ alignItems: 'end' }}>
          <label className="field">
            <span>Roll number</span>
            <input className="input" value={roll} onChange={(e) => setRoll(e.target.value.toUpperCase())} placeholder="26PGDM000" required />
          </label>
          <label className="field">
            <span>Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <button className="btn">Add to roster</button>
        </div>
        {message && (
          <p className="notice" role="alert">
            {message}
          </p>
        )}
      </form>

      <div>
        <div className={styles.toolbar}>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Search roll number or name…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search students" />
          <select className="select" style={{ maxWidth: 200 }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
            <option value="all">Everyone ({roster.length})</option>
            <option value="registered">Registered ({roster.filter((r) => r.registered).length})</option>
            <option value="pending">Not registered ({roster.filter((r) => !r.registered).length})</option>
          </select>
        </div>
        {roster.length === 0 ? (
          <div className={styles.emptyBox}>
            <strong>The roster is empty.</strong>
            Upload a seating plan, or add students above.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Roll no.</th>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Last seen</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rollNo} style={{ opacity: r.active ? 1 : 0.5 }}>
                    <th scope="row" className={styles.mono}>
                      {r.rollNo}
                    </th>
                    <td>
                      {r.name}
                      {r.source === 'manual' && <span className="dim" style={{ fontSize: 12 }}> · added manually</span>}
                    </td>
                    <td>
                      {!r.active ? (
                        <span className="pill pill--muted">Disabled</span>
                      ) : r.registered ? (
                        <span className="pill pill--ok">Registered</span>
                      ) : (
                        <span className="pill pill--muted">Not yet</span>
                      )}
                    </td>
                    <td className="dim" style={{ fontSize: 13 }}>
                      {r.lastSeenAt ? formatDateTime(r.lastSeenAt) : '—'}
                    </td>
                    <td>
                      <div className={styles.actions} style={{ justifyContent: 'flex-end' }}>
                        {r.registered && (
                          <button className="btn btn--ghost btn--sm" disabled={busy === r.rollNo} onClick={() => act(r.rollNo, 'reset')}>
                            Reset PIN
                          </button>
                        )}
                        <button className="btn btn--ghost btn--sm" disabled={busy === r.rollNo} onClick={() => act(r.rollNo, r.active ? 'deactivate' : 'activate')}>
                          {r.active ? 'Disable' : 'Enable'}
                        </button>
                        <button className="btn btn--danger btn--sm" disabled={busy === r.rollNo} onClick={() => act(r.rollNo, 'delete')}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
