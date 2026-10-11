import { z } from 'zod';
import { HttpError, clientIp, ok, readJson, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { findStudent, rosterSize } from '@/lib/students';
import { isValidRoll, maskedName, normaliseRoll } from '@/lib/names';

const body = z.object({ rollNo: z.string().min(1).max(32) });

/** Step 1 of registration: is this roll number on the Section E roster, and has it been claimed? */
export const POST = route(async (req) => {
  await enforce(`lookup:${clientIp(req)}`, 40, 15 * 60);
  const { rollNo } = await readJson(req, body);
  const roll = normaliseRoll(rollNo);
  if (!isValidRoll(roll)) throw new HttpError(422, 'That doesn’t look like a roll number. It should look like 26PGDM123.', 'invalid_roll');
  if ((await rosterSize()) === 0) {
    throw new HttpError(503, 'Registration opens once the admin uploads the Section E roster.', 'no_roster');
  }
  const student = await findStudent(roll);
  if (!student) throw new HttpError(404, `${roll} isn’t on the Section E roster. Check the number, or ask the admin to add you.`, 'not_found');
  return ok({
    rollNo: student.roll_no,
    status: student.pin_hash ? 'claimed' : 'unclaimed',
    // Only a masked name, and only before the roll number is claimed — enough to say "is this you?".
    name: student.pin_hash ? null : maskedName(student.name),
  });
});
