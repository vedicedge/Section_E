import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { setQuizStatus } from '@/lib/quizzes/repo';

const body = z.object({ status: z.enum(['draft', 'published']) });

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  const { status } = await readJson(req, body);
  await setQuizStatus((await params).id, status);
  return ok({ status });
});
