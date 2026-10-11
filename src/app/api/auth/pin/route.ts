import { z } from 'zod';
import { HttpError, clientIp, ok, readJson, route } from '@/lib/http';
import { enforce, reset } from '@/lib/rate-limit';
import { setStudentSession } from '@/lib/session';
import { claimStudent, findStudent, verifyStudentPin } from '@/lib/students';
import { firstName, normaliseRoll } from '@/lib/names';

const body = z.object({
  rollNo: z.string().min(1).max(32),
  pin: z.string().regex(/^\d{4}$/, 'The PIN must be exactly 4 digits.'),
  mode: z.enum(['create', 'enter']),
});

/** Step 2: create a PIN for an unclaimed roll number, or enter the PIN of a claimed one. */
export const POST = route(async (req) => {
  const { rollNo, pin, mode } = await readJson(req, body);
  const roll = normaliseRoll(rollNo);
  await enforce(`pin-ip:${clientIp(req)}`, 30, 15 * 60);

  const student = await findStudent(roll);
  if (!student) throw new HttpError(404, 'That roll number isn’t on the Section E roster.', 'not_found');

  if (mode === 'create') {
    const claimed = await claimStudent(student.roll_no, pin);
    await setStudentSession(claimed.roll_no, Number(claimed.session_version));
    return ok({ rollNo: claimed.roll_no, firstName: firstName(claimed.name) });
  }

  await enforce(`pin-roll:${student.roll_no}`, 6, 15 * 60, 'Too many wrong PINs for this roll number.');
  const verified = await verifyStudentPin(student.roll_no, pin);
  if (!verified) throw new HttpError(401, 'That PIN doesn’t match. Forgot it? Ask the admin to reset your registration.', 'wrong_pin');
  await reset(`pin-roll:${student.roll_no}`);
  await setStudentSession(verified.roll_no, Number(verified.session_version));
  return ok({ rollNo: verified.roll_no, firstName: firstName(verified.name) });
});
