import { resolver, type Grid } from '../grid';
import { cleanName, isValidRoll, normaliseRoll, titleCase } from '../names';

/**
 * Parses seating-plan sheets laid out like the official Section E workbook:
 *
 *   Row 5 | Seat No. | 1         | 2         | …
 *         | Roll No. | 26PGDM101 | 26PGDM102 | …
 *         | Name     | Student A | Student B | …
 *
 * One sheet per subject (sheet name = subject code, title cell = subject name). Labels are
 * found by text, not by fixed coordinates, so extra columns/rows or moved blocks still parse.
 */

export interface ParsedSeat {
  seatNumber: number;
  position: number; // 1-based, left → right as printed
  rollNo: string | null;
  name: string | null;
}

export interface ParsedRow {
  label: string; // "Row 5"
  number: number | null; // 5
  seats: ParsedSeat[];
}

export interface ParsedPlan {
  sheetName: string;
  code: string;
  title: string;
  rows: ParsedRow[]; // in printed order (top → bottom)
  assigned: number;
  /** Roll numbers printed more than once on this sheet → description of the extra seat(s). */
  conflicts: Record<string, string>;
  warnings: string[];
}

export interface ParsedSeatingWorkbook {
  plans: ParsedPlan[];
  students: { rollNo: string; name: string }[];
  warnings: string[];
}

const SEAT_LABEL = /^seat\s*(no\.?|number|#)?$/i;
const ROLL_LABEL = /^roll\s*(no\.?|number|#)?$/i;
const NAME_LABEL = /^(student\s*)?name$/i;
const ROW_LABEL = /^row\s*[-:#]?\s*([0-9]+|[A-Z])$/i;
const IGNORED_TITLE_LINE = /seating|section|^pgdm|batch|^term|^\d{4}/i;

function parseTitle(grid: Grid): string | null {
  const r = resolver(grid);
  for (let row = 0; row < Math.min(grid.rows, 4); row++) {
    for (let col = 0; col < Math.min(grid.cols, 6); col++) {
      const text = r.text(row, col);
      if (!text || ROW_LABEL.test(text) || SEAT_LABEL.test(text)) continue;
      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      const subject = [...lines].reverse().find((l) => !IGNORED_TITLE_LINE.test(l));
      if (subject) return titleCase(subject);
    }
  }
  return null;
}

function rowNumberFrom(label: string): number | null {
  const m = ROW_LABEL.exec(label.trim());
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : m[1]!.toUpperCase().charCodeAt(0) - 64;
}

export function parseSeatingSheet(grid: Grid): ParsedPlan | null {
  const r = resolver(grid);
  const warnings: string[] = [];
  const rows: ParsedRow[] = [];
  const seen = new Map<string, string>();
  const conflicts: Record<string, string> = {};

  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      if (!SEAT_LABEL.test(r.text(row, col))) continue;

      // Find the "Roll No." and "Name" lines that belong to this block (same label column, just below).
      let rollRow = -1;
      let nameRow = -1;
      for (let k = row + 1; k <= Math.min(row + 4, grid.rows - 1); k++) {
        const label = r.text(k, col);
        if (rollRow < 0 && ROLL_LABEL.test(label)) rollRow = k;
        else if (nameRow < 0 && NAME_LABEL.test(label)) nameRow = k;
        if (SEAT_LABEL.test(label)) break;
      }
      if (rollRow < 0) {
        warnings.push(`Found "Seat No." at ${grid.name}!R${row + 1} without a "Roll No." line below it — skipped.`);
        continue;
      }

      // Row label ("Row 5") sits to the left of the labels, usually in a vertically merged cell.
      let label = '';
      for (let k = row; k <= Math.max(rollRow, nameRow) && !label; k++) {
        for (let c = 0; c < col; c++) {
          const t = r.text(k, c);
          if (ROW_LABEL.test(t)) {
            label = t.replace(/\s+/g, ' ').trim();
            break;
          }
        }
      }
      if (!label) label = `Row ${rows.length + 1}`;

      const seats: ParsedSeat[] = [];
      for (let c = col + 1; c < grid.cols; c++) {
        const seatCell = r.get(row, c);
        const rollText = normaliseRoll(r.text(rollRow, c));
        const seatNumber = seatCell && seatCell.t === 'n' ? Number(seatCell.v) : Number.parseInt(seatCell?.text ?? '', 10);
        if (!Number.isFinite(seatNumber)) {
          if (rollText) warnings.push(`${label}: roll number ${rollText} has no seat number above it — skipped.`);
          continue;
        }
        let rollNo: string | null = rollText || null;
        if (rollNo && !isValidRoll(rollNo)) {
          warnings.push(`${label}, seat ${seatNumber}: "${r.text(rollRow, c)}" is not a valid roll number — treated as empty.`);
          rollNo = null;
        }
        if (rollNo && seen.has(rollNo)) {
          const where = `${label}, Seat ${seatNumber}`;
          warnings.push(`${rollNo} appears twice (${seen.get(rollNo)} and ${where}) — the first seat is used; the student is told about the duplicate.`);
          conflicts[rollNo] = conflicts[rollNo] ? `${conflicts[rollNo]}; ${where}` : where;
          rollNo = null;
        }
        const rawName = nameRow >= 0 ? r.text(nameRow, c) : '';
        if (rollNo) seen.set(rollNo, `${label}, Seat ${seatNumber}`);
        seats.push({
          seatNumber,
          position: seats.length + 1,
          rollNo,
          name: rollNo && rawName ? cleanName(rawName) : null,
        });
      }
      if (seats.length) rows.push({ label, number: rowNumberFrom(label), seats });
    }
  }

  if (!rows.length) return null;
  const code = grid.name.replace(/\s+/g, ' ').trim();
  return {
    sheetName: grid.name,
    code,
    title: parseTitle(grid) ?? code,
    rows,
    assigned: seen.size,
    conflicts,
    warnings,
  };
}

export function parseSeatingWorkbook(grids: Grid[]): ParsedSeatingWorkbook {
  const plans: ParsedPlan[] = [];
  const warnings: string[] = [];
  const names = new Map<string, Map<string, number>>();

  for (const grid of grids) {
    if (grid.hidden) continue;
    const plan = parseSeatingSheet(grid);
    if (!plan) {
      warnings.push(`Sheet "${grid.name}" has no seating blocks — ignored.`);
      continue;
    }
    plans.push(plan);
    for (const row of plan.rows) {
      for (const seat of row.seats) {
        if (!seat.rollNo) continue;
        const counts = names.get(seat.rollNo) ?? new Map<string, number>();
        if (seat.name) counts.set(seat.name, (counts.get(seat.name) ?? 0) + 1);
        names.set(seat.rollNo, counts);
      }
    }
  }

  const students = [...names.entries()]
    .map(([rollNo, counts]) => {
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      return { rollNo, name: best?.[0] ?? rollNo };
    })
    .sort((a, b) => a.rollNo.localeCompare(b.rollNo));

  const codes = new Set<string>();
  for (const p of plans) {
    if (codes.has(p.code.toUpperCase())) warnings.push(`Two sheets share the subject code "${p.code}".`);
    codes.add(p.code.toUpperCase());
  }

  return { plans, students, warnings };
}
