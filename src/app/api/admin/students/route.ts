import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { addStudent } from '@/lib/students';

const body = z.object({ rollNo: z.string().min(1).max(32), name: z.string().min(1).max(120) });

export const POST = route(async (req) => {
  await requireAdmin();
  const { rollNo, name } = await readJson(req, body);
  return ok({ rollNo: await addStudent(rollNo, name) });
});
