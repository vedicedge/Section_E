import { z } from 'zod';
import { ok, readJson, requireStudent, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { MAX_SESSIONS } from '@/lib/attendance/calc';
import { strikeHearts } from '@/lib/attendance/repo';

const body = z.object({
  subjectId: z.string().min(1).max(40),
  delta: z
    .number()
    .int()
    // Many quick taps arrive netted into one delta; the SQL clamps to the subject's sessions.
    .min(-MAX_SESSIONS)
    .max(MAX_SESSIONS)
    .refine((d) => d !== 0, 'Strike at least one heart.'),
});

/** Strikes (or restores) the signed-in student's own hearts for one subject, as a delta. */
export const POST = route(async (req) => {
  const student = await requireStudent();
  const { subjectId, delta } = await readJson(req, body);
  await enforce(`attendance:${student.rollNo}`, 300, 10 * 60, 'You’re updating very fast — give it a moment.');
  return ok(await strikeHearts(student.rollNo, subjectId, delta));
});
