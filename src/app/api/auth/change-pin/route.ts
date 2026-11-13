import { z } from 'zod';
import { ok, readJson, requireStudent, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { setStudentSession } from '@/lib/session';
import { setStudentPin } from '@/lib/students';

const body = z.object({ pin: z.string().regex(/^\d{4}$/, 'The PIN must be exactly 4 digits.') });

/**
 * A student who is still signed in on this device chooses a new PIN; the old one isn't needed,
 * since being signed in already proves who they are. Every other device is signed out.
 */
export const POST = route(async (req) => {
  const student = await requireStudent();
  await enforce(`change-pin:${student.rollNo}`, 10, 60 * 60);
  const { pin } = await readJson(req, body);
  const row = await setStudentPin(student.rollNo, pin);
  await setStudentSession(row.roll_no, Number(row.session_version));
  return ok({ ok: true });
});
