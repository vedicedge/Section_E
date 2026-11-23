import { z } from 'zod';
import { HttpError, ok, readJson, requireAdmin, route } from '@/lib/http';
import { revisionQuestionSchema } from '@/lib/revision/model';
import { deleteRevisionQuestion, updateRevisionQuestion } from '@/lib/revision/repo';

type Ctx = { params: Promise<{ id: string }> };

/** Edits a revision question. Students' drafts stay; ticks on key points that no longer exist are dropped. */
export const PUT = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const { question } = await readJson(req, z.object({ question: revisionQuestionSchema }));
  if (!(await updateRevisionQuestion((await params).id, question))) throw new HttpError(404, 'That question no longer exists.', 'not_found');
  return ok({ saved: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  await deleteRevisionQuestion((await params).id);
  return ok({ deleted: true });
});
