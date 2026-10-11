/**
 * A spreadsheet sheet flattened into plain data, so parsers stay pure and testable
 * (no ExcelJS objects) and the original layout can be rendered in the browser.
 */
export interface GridCell {
  /** s = text, n = number, date = calendar date ('YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM'), time = 'HH:MM', z = empty but styled */
  t: 's' | 'n' | 'date' | 'time' | 'z';
  v: string | number | null;
  text: string;
  style?: { bold?: boolean; italic?: boolean; strike?: boolean; color?: string; fill?: string };
}

export interface GridMerge {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface Grid {
  name: string;
  rows: number;
  cols: number;
  cells: (GridCell | null)[][];
  merges: GridMerge[];
  hidden?: boolean;
}

/** Cell lookup that resolves merged ranges to their top-left (master) cell. */
export function resolver(grid: Grid) {
  const masterOf = new Map<string, [number, number]>();
  for (const m of grid.merges) {
    for (let r = m.r1; r <= m.r2; r++) {
      for (let c = m.c1; c <= m.c2; c++) {
        if (r !== m.r1 || c !== m.c1) masterOf.set(`${r}:${c}`, [m.r1, m.c1]);
      }
    }
  }
  return {
    /** Cell at (r, c), following merges. */
    get(r: number, c: number): GridCell | null {
      const master = masterOf.get(`${r}:${c}`);
      const [mr, mc] = master ?? [r, c];
      return grid.cells[mr]?.[mc] ?? null;
    },
    text(r: number, c: number): string {
      const master = masterOf.get(`${r}:${c}`);
      const [mr, mc] = master ?? [r, c];
      return grid.cells[mr]?.[mc]?.text ?? '';
    },
    /** True when (r, c) is covered by a merge but is not its master cell. */
    isCovered(r: number, c: number): boolean {
      return masterOf.has(`${r}:${c}`);
    },
    master(r: number, c: number): [number, number] {
      return masterOf.get(`${r}:${c}`) ?? [r, c];
    },
  };
}
