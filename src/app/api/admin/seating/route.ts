import { z } from 'zod';
import { HttpError, ok, requireAdmin, route } from '@/lib/http';
import { query } from '@/lib/db';
import { env } from '@/lib/env';
import { readWorkbook, looksLikeXlsx } from '@/lib/xlsx';
import { parseSeatingWorkbook } from '@/lib/seating/parse';
import { importSeating } from '@/lib/seating/repo';
import { downloadSource, parseSourceUrl, SourceError } from '@/lib/timetable/source';

const MAX_UPLOAD = 10 * 1024 * 1024;
const isoDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.literal('')]).transform((v) => v || null);

const options = z.object({
  commit: z.enum(['0', '1']).default('0'),
  mode: z.enum(['replace', 'add']).default('replace'),
  kind: z.enum(['class', 'exam']).default('class'),
  validFrom: isoDate.default(''),
  validTo: isoDate.default(''),
  room: z.string().trim().max(80).default('').transform((v) => v || null),
  sheets: z.string().default('[]'),
});

/**
 * Upload (or link) a seating workbook. commit=0 returns a preview; commit=1 imports it.
 * Student names never leave this endpoint except as counts.
 */
export const POST = route(async (req) => {
  await requireAdmin();
  const form = await req.formData();
  const opts = options.parse(Object.fromEntries([...form.entries()].filter(([, v]) => typeof v === 'string')));

  let bytes: Uint8Array;
  let sourceName: string;
  const file = form.get('file');
  const url = form.get('url');
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD) throw new HttpError(413, 'That file is larger than 10 MB.', 'too_large');
    bytes = new Uint8Array(await file.arrayBuffer());
    sourceName = file.name;
  } else if (typeof url === 'string' && url.trim()) {
    try {
      const downloaded = await downloadSource(parseSourceUrl(url), env.googleApiKey);
      bytes = downloaded.bytes;
      sourceName = downloaded.fileName ?? 'linked workbook';
    } catch (err) {
      if (err instanceof SourceError) throw new HttpError(422, err.message, err.code);
      throw err;
    }
  } else {
    throw new HttpError(422, 'Choose an .xlsx file or paste a share link.', 'no_file');
  }
  if (!looksLikeXlsx(bytes)) throw new HttpError(422, 'That is not an .xlsx workbook. In Excel use File › Save As › Excel Workbook.', 'not_xlsx');

  let parsed;
  try {
    parsed = parseSeatingWorkbook(await readWorkbook(Buffer.from(bytes)));
  } catch (err) {
    throw new HttpError(422, (err as Error).message, 'unreadable');
  }
  if (!parsed.plans.length) {
    throw new HttpError(422, 'No seating blocks were found. Each sheet needs “Seat No.”, “Roll No.” (and optionally “Name”) rows.', 'no_plans');
  }

  const existing = new Set((await query<{ roll_no: string }>('SELECT roll_no FROM students')).map((r) => r.roll_no));
  const preview = {
    sourceName,
    plans: parsed.plans.map((p) => ({
      sheetName: p.sheetName,
      code: p.code,
      title: p.title,
      rows: p.rows.map((r) => ({ label: r.label, seats: r.seats.length })),
      assigned: p.assigned,
      warnings: p.warnings,
    })),
    students: parsed.students.length,
    newStudents: parsed.students.filter((s) => !existing.has(s.rollNo)).length,
    warnings: parsed.warnings,
  };

  if (opts.commit !== '1') return ok({ preview });

  const sheets = z.array(z.string()).parse(JSON.parse(opts.sheets));
  const result = await importSeating(parsed, {
    mode: opts.mode,
    kind: opts.kind,
    validFrom: opts.validFrom,
    validTo: opts.validTo,
    room: opts.room,
    sourceName,
    sheets,
  });
  return ok({ preview, result });
});
