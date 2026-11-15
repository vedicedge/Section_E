import { ok, requireAdmin, route } from '@/lib/http';
import { deleteAnnouncement } from '@/lib/announcements';

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  await deleteAnnouncement((await params).id);
  return ok({ deleted: true });
});
