import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { saveQuiz } from '@/lib/quizzes/repo';
import { quizInputSchema } from '@/lib/quizzes/schema';

export const POST = route(async (req) => {
  await requireAdmin();
  const input = await readJson(req, quizInputSchema);
  const id = await saveQuiz(null, input);
  return ok({ id });
});
