import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { deleteHomework, updateHomework } from '@/lib/homework/repo';
import { homeworkItemSchema } from '@/lib/homework/schema';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const input = await readJson(req, homeworkItemSchema);
  return ok({ item: await updateHomework(id, input) });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  await deleteHomework((await params).id);
  return ok({ ok: true });
});
