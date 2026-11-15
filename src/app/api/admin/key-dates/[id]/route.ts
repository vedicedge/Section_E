import { ok, requireAdmin, route } from '@/lib/http';
import { deleteKeyDate } from '@/lib/key-dates';

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await deleteKeyDate((await params).id);
  return ok({ deleted: true });
});
