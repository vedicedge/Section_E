/**
 * Writes a SYNTHETIC timetable workbook for local testing (fake faculty, made-up rooms).
 * It mimics a common layout: one row per section per day, time slots across the top.
 *
 *   node --import tsx tests/fixtures/make-sample-timetable.ts out.xlsx [YYYY-MM-DD monday]
 */
import ExcelJS from 'exceljs';

const out = process.argv[2] ?? 'sample-timetable.xlsx';
const monday = process.argv[3] ?? (() => {
  const d = new Date();
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d.toISOString().slice(0, 10);
})();

const slots = ['9:00 - 10:15', '10:30 - 11:45', '12:00 - 1:15', '2:15 - 3:30', '3:45 - 5:00'];
const subjects = ['SM', 'DAM', 'CF', 'DT', 'OM', 'TOD', 'MM II'];
const faculty: Record<string, string> = { SM: 'Prof. A. Rao', DAM: 'Dr. K. Menon', CF: 'Prof. S. Iyer', DT: 'Dr. P. Kale', OM: 'Prof. R. Nair', TOD: 'Dr. M. Das', 'MM II': 'Prof. V. Sen' };
const sections = ['A', 'B', 'C', 'D', 'E', 'F'];

const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet('Week Timetable');
ws.addRow(['SAMPLE DATA — PGDM 2026-28 TERM II TIMETABLE (synthetic, for testing)']);
ws.mergeCells('A1:H1');
ws.addRow(['Date', 'Day', 'Section', ...slots]);
ws.getRow(2).font = { bold: true };

for (let d = 0; d < 6; d++) {
  const date = new Date(`${monday}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + d);
  const start = ws.rowCount + 1;
  sections.forEach((sec, si) => {
    const cells = slots.map((_, k) => {
      if ((d + si + k) % 4 === 3) return '';
      const sub = subjects[(d * 3 + si * 2 + k) % subjects.length]!;
      return sec === 'E' ? `${sub}\n${faculty[sub]}\nRoom E-01` : `${sub} (${faculty[sub]!.split(' ').pop()})`;
    });
    if (sec === 'E' && d === 1) cells[2] = 'CF - Rescheduled to Friday';
    if (sec === 'E' && d === 3) cells[4] = 'Mid Term Exam - OM';
    ws.addRow([si === 0 ? date : null, si === 0 ? date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) : null, sec, ...cells]);
  });
  ws.mergeCells(start, 1, start + sections.length - 1, 1);
  ws.mergeCells(start, 2, start + sections.length - 1, 2);
  ws.getCell(start, 1).numFmt = 'dd-mmm-yyyy';
}
ws.getCell(ws.rowCount - 1, 4).font = { strike: true };

await wb.xlsx.writeFile(out);
console.log(`Wrote ${out} (week of ${monday})`);
