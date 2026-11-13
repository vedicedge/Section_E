import { z } from 'zod';
import { HttpError, clientIp, ok, readJson, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { setStudentSession } from '@/lib/session';
import { checkRecoveryCode, findStudent, issueRecoveryCode, setStudentPin } from '@/lib/students';
import { firstName, normaliseRoll } from '@/lib/names';

const body = z.object({
  rollNo: z.string().min(1).max(32),
  code: z.string().min(1).max(40),
  pin: z.string().regex(/^\d{4}$/, 'The PIN must be exactly 4 digits.'),
});

/**
 * Forgot the PIN and signed out everywhere: the roll number plus the recovery code sets a new PIN.
 * The code is used up — a fresh one comes back to save — and every other device is signed out.
 */
export const POST = route(async (req) => {
  await enforce(`recover-ip:${clientIp(req)}`, 10, 15 * 60);
  const { rollNo, code, pin } = await readJson(req, body);
  const student = await findStudent(normaliseRoll(rollNo));
  if (!student) throw new HttpError(404, 'That roll number isn’t on the Section E roster.', 'not_found');
  if (!student.pin_hash) throw new HttpError(409, 'This roll number isn’t registered yet, so there’s no PIN to reset. Register it instead.', 'not_claimed');

  await enforce(`recover-roll:${student.roll_no}`, 5, 60 * 60, 'Too many wrong recovery codes for this roll number.');
  if (!(await checkRecoveryCode(student.roll_no, code))) {
    throw new HttpError(401, 'That recovery code doesn’t match. No code saved? Ask the admin to reset your registration.', 'wrong_code');
  }

  const row = await setStudentPin(student.roll_no, pin);
  const recoveryCode = await issueRecoveryCode(row.roll_no);
  await setStudentSession(row.roll_no, Number(row.session_version));
  return ok({ rollNo: row.roll_no, firstName: firstName(row.name), recoveryCode });
});
