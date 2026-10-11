/**
 * Imports a seating-plan workbook from the command line (same code path as /admin/seating).
 *
 *   npm run import-seating -- path/to/Seating_Plan.xlsx [--add] [--exam] [--from 2026-11-01] [--to 2026-11-30] [--room "Room 12"]
 *
 * Uses DATABASE_URL when set, otherwise the local PGlite database in .data/pglite
 * (stop `npm run dev` first — PGlite allows one process at a time).
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { readWorkbook } from '../src/lib/xlsx';
import { parseSeatingWorkbook } from '../src/lib/seating/parse';
import { importSeating } from '../src/lib/seating/repo';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !/^\d{4}-\d{2}-\d{2}$/.test(a));
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};

if (!file) {
  console.error('Usage: npm run import-seating -- <file.xlsx> [--add] [--exam] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--room NAME]');
  process.exit(1);
}

const grids = await readWorkbook(await readFile(file));
const parsed = parseSeatingWorkbook(grids);
for (const plan of parsed.plans) {
  console.log(`• ${plan.code.padEnd(6)} ${plan.title} — ${plan.rows.length} rows, ${plan.assigned} students`);
  for (const w of plan.warnings) console.log(`    ! ${w}`);
}
for (const w of parsed.warnings) console.log(`! ${w}`);

const result = await importSeating(parsed, {
  mode: flag('add') ? 'add' : 'replace',
  kind: flag('exam') ? 'exam' : 'class',
  validFrom: option('from'),
  validTo: option('to'),
  room: option('room'),
  sourceName: basename(file),
});
console.log(`Imported ${result.imported} plans (${result.removed} replaced), ${result.addedStudents} new students on the roster.`);
process.exit(0);
