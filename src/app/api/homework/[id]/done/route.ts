import { z } from 'zod';
import { HttpError, ok, readJson, requireStudent, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { setDone } from '@/lib/homework/repo';

const body = z.object({ done: z.boolean() });

/** Ticks a homework item off (or back on) for the signed-in student only. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const student = await requireStudent();
  const { id } = await params;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) throw new HttpError(404, 'That homework no longer exists.', 'not_found');
  const { done } = await readJson(req, body);
  await enforce(`hw-done:${student.rollNo}`, 200, 10 * 60, 'You’re ticking things off very fast.');
  await setDone(id, student.rollNo, done);
  return ok({ id, done });
});
