import { ok, requireAdmin, route } from '@/lib/http';
import { deleteMockLink } from '@/lib/extras';

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await deleteMockLink((await params).id);
  return ok({ deleted: true });
});
