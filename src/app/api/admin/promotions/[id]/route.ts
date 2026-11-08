import { ok, requireAdmin, route } from '@/lib/http';
import { deletePromotion } from '@/lib/extras';

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await deletePromotion((await params).id);
  return ok({ deleted: true });
});
