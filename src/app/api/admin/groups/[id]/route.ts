import { ok, requireAdmin, route } from '@/lib/http';
import { deleteGroupSet } from '@/lib/groups/repo';

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await deleteGroupSet((await params).id);
  return ok({ deleted: true });
});
