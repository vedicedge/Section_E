import { z } from 'zod';
import { HttpError, ok, readJson, requireAdmin, route } from '@/lib/http';
import { addKeyDates } from '@/lib/key-dates';
import { parseDateLines } from '@/lib/coming-up';

const one = z.object({
  mode: z.literal('one'),
  kind: z.enum(['exam', 'presentation', 'quiz', 'event']),
  subject: z
    .string()
    .trim()
    .max(40)
    .default('')
    .transform((v) => v.toUpperCase() || null),
  title: z.string().trim().min(1, 'Give it a title.').max(160),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
  atTime: z
    .string()
    .trim()
    .default('')
    .refine((v) => v === '' || /^\d{2}:\d{2}$/.test(v), 'Pick a valid time.')
    .transform((v) => v || null),
  details: z.string().trim().max(1000).default(''),
});

const many = z.object({
  mode: z.literal('paste'),
  kind: z.enum(['exam', 'presentation', 'quiz', 'event']).default('exam'),
  text: z.string().max(20_000),
});

/** Adds one date, or a pasted schedule ("date, subject, title[, time]" per line) in one go. */
export const POST = route(async (req) => {
  await requireAdmin();
  const input = await readJson(req, z.discriminatedUnion('mode', [one, many]));
  if (input.mode === 'one') {
    await addKeyDates([{ kind: input.kind, subject: input.subject, title: input.title, onDate: input.onDate, atTime: input.atTime, details: input.details }]);
    return ok({ added: 1 });
  }
  const { rows, errors } = parseDateLines(input.text);
  if (errors.length) throw new HttpError(422, errors.slice(0, 5).join(' '), 'invalid', { errors });
  if (!rows.length) throw new HttpError(422, 'Paste at least one line.', 'invalid');
  if (rows.length > 100) throw new HttpError(422, 'That’s more than 100 lines. Split it into smaller pastes.', 'invalid');
  await addKeyDates(rows.map((r) => ({ kind: input.kind, subject: r.subject, title: r.title, onDate: r.onDate, atTime: r.atTime, details: '' })));
  return ok({ added: rows.length });
});
