import { z } from 'zod';
import { ok, readJson, requireStudent, route } from '@/lib/http';
import { resetCleared, setCleared } from '@/lib/quizzes/mistakes-repo';

const body = z.union([
  z.object({ questionId: z.string().min(1).max(64), cleared: z.boolean() }),
  z.object({ resetAll: z.literal(true) }),
]);

/** "Got it" on a mistake hides it from the notebook; "Undo" or "Bring them all back" restores. */
export const POST = route(async (req) => {
  const student = await requireStudent();
  const input = await readJson(req, body);
  if ('resetAll' in input) await resetCleared(student.rollNo);
  else await setCleared(student.rollNo, input.questionId, input.cleared);
  return ok({ saved: true });
});
