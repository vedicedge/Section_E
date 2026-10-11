import { ok, requireAdmin, route } from '@/lib/http';
import { deleteAttempt } from '@/lib/quizzes/repo';

/** Removing an attempt lets that student take the test again. */
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await deleteAttempt((await params).id);
  return ok({ ok: true });
});
