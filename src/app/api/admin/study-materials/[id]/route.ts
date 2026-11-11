import { ok, requireAdmin, route } from '@/lib/http';
import { deleteStudyMaterial } from '@/lib/study';

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await deleteStudyMaterial((await params).id);
  return ok({ deleted: true });
});
