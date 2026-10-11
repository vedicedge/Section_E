import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { deleteQuiz, saveQuiz } from '@/lib/quizzes/repo';
import { quizInputSchema } from '@/lib/quizzes/schema';

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const input = await readJson(req, quizInputSchema);
  await saveQuiz(id, input);
  return ok({ id });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  await deleteQuiz((await params).id);
  return ok({ ok: true });
});
