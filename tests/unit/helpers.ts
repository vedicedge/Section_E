import type { Grid, GridCell, GridMerge } from '@/lib/grid';

/** Builds a Grid from a 2-D array. Strings starting with "@date:" become date cells. */
export function grid(name: string, rows: (string | number | null)[][], merges: GridMerge[] = []): Grid {
  const cols = Math.max(...rows.map((r) => r.length));
  const cells: (GridCell | null)[][] = rows.map((r) =>
    Array.from({ length: cols }, (_, j) => {
      const v = r[j];
      if (v === null || v === undefined || v === '') return null;
      if (typeof v === 'number') return { t: 'n', v, text: String(v) } as GridCell;
      if (v.startsWith('@date:')) return { t: 'date', v: v.slice(6), text: v.slice(6) } as GridCell;
      if (v.startsWith('@strike:')) return { t: 's', v: v.slice(8), text: v.slice(8), style: { strike: true } } as GridCell;
      return { t: 's', v, text: v } as GridCell;
    }),
  );
  return { name, rows: rows.length, cols, cells, merges };
}
