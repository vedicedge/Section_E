import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { saveStudentEmails } from '@/lib/placements/emails';

const body = z.object({ text: z.string().min(1).max(100_000) });

export const POST = route(async (req) => {
  await requireAdmin();
  const { text } = await readJson(req, body);
  return ok(await saveStudentEmails(text));
});
