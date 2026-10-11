import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import ExcelJS from 'exceljs';

/** Fresh database + synthetic workbooks (made-up names — never real student data). */
export default async function globalSetup() {
  const root = join(import.meta.dirname, '..', '..');
  await rm(join(root, '.data', 'e2e'), { recursive: true, force: true });
  const dir = join(import.meta.dirname, '.fixtures');
  await mkdir(dir, { recursive: true });

  // Seating plan in the official layout: Row label | Seat No. / Roll No. / Name.
  const wb = new ExcelJS.Workbook();
  const sheets: [string, string, string[][]][] = [
    ['SM', 'STRATEGIC MANAGEMENT', [['26PGDM901', '26PGDM902', '26PGDM903'], ['26PGDM904', '26PGDM905']]],
    ['CF', 'CORPORATE FINANCE', [['26PGDM905', '26PGDM904', '26PGDM903'], ['26PGDM902', '26PGDM901']]],
  ];
  for (const [code, title, rows] of sheets) {
    const ws = wb.addWorksheet(code);
    ws.addRow([`PGDM 2026-28\nSECTION E\nSEATING PLAN\n${title}`]);
    ws.mergeCells('A1:F1');
    rows.forEach((rolls, i) => {
      const label = `Row ${rows.length - i}`;
      const start = ws.rowCount + 1;
      ws.addRow([label, 'Seat No.', ...rolls.map((_, k) => k + 1)]);
      ws.addRow([null, 'Roll No.', ...rolls]);
      ws.addRow([null, 'Name', ...rolls.map((r) => `Test Student ${r.slice(-3)}`)]);
      ws.mergeCells(start, 1, start + 2, 1);
      ws.addRow([]);
    });
  }
  await wb.xlsx.writeFile(join(dir, 'seating.xlsx'));

  // Timetable: time slots across, a Section column, dates down the side (today + tomorrow).
  const tt = new ExcelJS.Workbook();
  const ws = tt.addWorksheet('Timetable');
  ws.addRow(['SAMPLE TIMETABLE (synthetic)']);
  ws.addRow(['Date', 'Section', '9:00 - 10:15', '10:30 - 11:45']);
  const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  for (let d = 0; d < 2; d++) {
    const date = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() + d));
    ws.addRow([date, 'D', 'OM', 'TOD']);
    ws.addRow([date, 'E', 'SM\nProf. Test Faculty\nRoom 101', 'CF']);
  }
  await tt.xlsx.writeFile(join(dir, 'timetable.xlsx'));
}
