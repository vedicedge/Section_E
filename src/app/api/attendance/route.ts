import { z } from 'zod';
import { ok, readJson, requireStudent, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { MAX_SESSIONS } from '@/lib/attendance/calc';
import { updateAttendance } from '@/lib/attendance/repo';

const body = z
  .object({
    subjectId: z.string().min(1).max(40),
    total: z.number().int().min(1).max(MAX_SESSIONS).nullable().optional(),
    held: z.number().int().min(0).max(MAX_SESSIONS).nullable().optional(),
    missed: z.number().int().min(0).max(MAX_SESSIONS).optional(),
  })
  .refine((b) => b.total !== undefined || b.held !== undefined || b.missed !== undefined, 'Nothing to change.');

/** Sets the signed-in student's own numbers for one subject. Nobody else can see or change them. */
export const PATCH = route(async (req) => {
  const student = await requireStudent();
  const patch = await readJson(req, body);
  await enforce(`attendance:${student.rollNo}`, 300, 10 * 60, 'You’re updating very fast — give it a moment.');
  return ok(await updateAttendance(student.rollNo, patch));
});
