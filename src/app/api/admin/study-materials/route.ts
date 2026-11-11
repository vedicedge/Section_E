import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { addStudyMaterial } from '@/lib/study';

const body = z.object({
  subject: z
    .string()
    .trim()
    .max(40)
    .default('')
    .transform((v) => v.toUpperCase() || null),
  title: z.string().trim().min(1, 'Give it a title.').max(160),
  url: z.string().trim().regex(/^https:\/\/\S+$/, 'The link must start with https://').max(2000),
});

/** Adds a study-material link (notes on Drive, a YouTube video, …) to the Study material page. */
export const POST = route(async (req) => {
  await requireAdmin();
  await addStudyMaterial(await readJson(req, body));
  return ok({ saved: true });
});
