import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { deleteStudent, resetStudent, setStudentActive } from '@/lib/students';
import { normaliseRoll } from '@/lib/names';

const body = z.object({ action: z.enum(['reset', 'activate', 'deactivate']) });
type Ctx = { params: Promise<{ roll: string }> };

export const PATCH = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const roll = normaliseRoll(decodeURIComponent((await params).roll));
  const { action } = await readJson(req, body);
  if (action === 'reset') await resetStudent(roll);
  else await setStudentActive(roll, action === 'activate');
  return ok({ ok: true });
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  await requireAdmin();
  await deleteStudent(normaliseRoll(decodeURIComponent((await params).roll)));
  return ok({ ok: true });
});
