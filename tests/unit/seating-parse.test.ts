import { describe, expect, it } from 'vitest';
import { parseSeatingWorkbook } from '@/lib/seating/parse';
import { cleanName, maskedName, normaliseRoll, isValidRoll } from '@/lib/names';
import { grid } from './helpers';

// Synthetic names only — the real workbook is never committed (the repository is public).
function sheet(name: string, title: string, rows: [string, (string | null)[]][]) {
  const data: (string | number | null)[][] = [[`PGDM 2026-28\nSECTION E\nSEATING PLAN\n${title}`]];
  const merges = [{ r1: 0, c1: 0, r2: 0, c2: 10 }];
  for (const [label, rolls] of rows) {
    const start = data.length;
    data.push([label, 'Seat No.', ...rolls.map((_, i) => i + 1)]);
    data.push([null, 'Roll No.', ...rolls]);
    data.push([null, 'Name', ...rolls.map((r) => (r ? `Student ${r.slice(-3)}` : null))]);
    data.push([], []);
    merges.push({ r1: start, c1: 0, r2: start + 2, c2: 0 });
  }
  return grid(name, data, merges);
}

describe('parseSeatingWorkbook', () => {
  it('reads every block with row labels, seats and roll numbers', () => {
    const res = parseSeatingWorkbook([
      sheet('SM', 'STRATEGIC MANAGEMENT', [
        ['Row 2', ['26PGDM101', '26PGDM102', '26PGDM103']],
        ['Row 1', ['26PGDM104', null, '25PGDM999R']],
      ]),
      sheet('MM II', 'MARKETING MANAGEMENT II', [['Row 1', ['26PGDM104', '26PGDM101']]]),
    ]);
    expect(res.plans).toHaveLength(2);
    const sm = res.plans[0]!;
    expect(sm).toMatchObject({ code: 'SM', title: 'Strategic Management', assigned: 5 });
    expect(sm.rows.map((r) => [r.label, r.number, r.seats.length])).toEqual([
      ['Row 2', 2, 3],
      ['Row 1', 1, 3],
    ]);
    expect(sm.rows[1]!.seats[1]).toEqual({ seatNumber: 2, position: 2, rollNo: null, name: null });
    expect(res.plans[1]!.title).toBe('Marketing Management II');
    expect(res.students.map((s) => s.rollNo)).toEqual(['25PGDM999R', '26PGDM101', '26PGDM102', '26PGDM103', '26PGDM104']);
  });

  it('flags duplicated roll numbers instead of silently picking one', () => {
    const res = parseSeatingWorkbook([sheet('CF', 'CORPORATE FINANCE', [['Row 1', ['26PGDM101', '26PGDM101']]])]);
    expect(res.plans[0]!.assigned).toBe(1);
    expect(res.plans[0]!.conflicts).toEqual({ '26PGDM101': 'Row 1, Seat 2' });
    expect(res.plans[0]!.warnings[0]).toMatch(/appears twice/);
  });
});

describe('name helpers', () => {
  it('normalises and validates roll numbers', () => {
    expect(normaliseRoll(' 26pgdm 123 ')).toBe('26PGDM123');
    expect(isValidRoll('26PGDM123')).toBe(true);
    expect(isValidRoll('25PGDM999R')).toBe(true);
    expect(isValidRoll('hello')).toBe(false);
  });
  it('tidies names from the sheet', () => {
    expect(cleanName('Meera . Iyer')).toBe('Meera Iyer');
    expect(cleanName('Arjun Rao .')).toBe('Arjun Rao');
    expect(cleanName('KABIR MEHTA')).toBe('Kabir Mehta');
    expect(maskedName('Riya S Kapoor')).toBe('Riya K.');
  });
});
