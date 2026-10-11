'use client';

import { useMemo, useState } from 'react';
import type { Grid } from '@/lib/grid';
import styles from './timetable.module.css';

function colName(c: number) {
  let s = '';
  let n = c + 1;
  while (n > 0) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Renders the workbook as published (merged cells, bold, strike-through, fills), Section E cells outlined. */
export function OriginalSheet({ sheets, highlight, fileName }: { sheets: Grid[]; highlight: string[]; fileName: string | null }) {
  const withContent = sheets.filter((s) => s.rows > 0 && s.cols > 0);
  const firstHighlighted = withContent.findIndex((s) => highlight.some((h) => h.startsWith(`${s.name}!`)));
  const [index, setIndex] = useState(Math.max(0, firstHighlighted));
  const [query, setQuery] = useState('');
  const sheet = withContent[index];
  const marked = useMemo(() => new Set(highlight), [highlight]);

  const layout = useMemo(() => {
    if (!sheet) return null;
    const covered = new Set<string>();
    const spans = new Map<string, { rowSpan: number; colSpan: number }>();
    for (const m of sheet.merges) {
      spans.set(`${m.r1}:${m.c1}`, { rowSpan: m.r2 - m.r1 + 1, colSpan: m.c2 - m.c1 + 1 });
      for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(`${r}:${c}`);
    }
    return { covered, spans };
  }, [sheet]);

  if (!sheet || !layout) return <p className={styles.none}>The workbook has no visible content.</p>;
  const q = query.trim().toLowerCase();

  return (
    <div className={styles.sheet}>
      <div className={styles.sheetBar}>
        {withContent.length > 1 && (
          <div className={styles.sheetTabs} role="tablist" aria-label="Sheets">
            {withContent.map((s, i) => (
              <button key={s.name} role="tab" aria-selected={i === index} className={styles.sheetTab} onClick={() => setIndex(i)}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        <label className={styles.find}>
          <span className="sr-only">Find in sheet</span>
          <input className="input" placeholder="Find (e.g. CF, Room 12)…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      <div className={styles.sheetScroll} tabIndex={0} aria-label={`Sheet ${sheet.name}${fileName ? ` from ${fileName}` : ''}`}>
        <table className={styles.grid}>
          <thead>
            <tr>
              <th aria-hidden />
              {Array.from({ length: sheet.cols }, (_, c) => (
                <th key={c} scope="col">
                  {colName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.cells.map((row, r) => (
              <tr key={r}>
                <th scope="row">{r + 1}</th>
                {Array.from({ length: sheet.cols }, (_, c) => {
                  if (layout.covered.has(`${r}:${c}`)) return null;
                  const cell = row[c];
                  const span = layout.spans.get(`${r}:${c}`);
                  const address = `${colName(c)}${r + 1}`;
                  const isE = marked.has(`${sheet.name}!${address}`);
                  const hit = q && cell?.text.toLowerCase().includes(q);
                  const style: React.CSSProperties = {};
                  if (cell?.style?.bold) style.fontWeight = 650;
                  if (cell?.style?.italic) style.fontStyle = 'italic';
                  if (cell?.style?.strike) style.textDecoration = 'line-through';
                  if (cell?.style?.fill) style.background = `color-mix(in srgb, ${cell.style.fill} 38%, transparent)`;
                  return (
                    <td
                      key={c}
                      rowSpan={span?.rowSpan}
                      colSpan={span?.colSpan}
                      className={`${isE ? styles.cellE : ''} ${hit ? styles.cellHit : ''}`}
                      style={style}
                      title={isE ? 'Section E' : undefined}
                    >
                      {cell?.text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.footnote}>
        {fileName ? `${fileName} · ` : ''}Exactly as published{highlight.length ? ' — Section E sessions are outlined in red.' : '.'}
      </p>
    </div>
  );
}
