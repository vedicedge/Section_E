import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { addMockLink } from '@/lib/extras';

const body = z.object({ title: z.string().trim().min(1).max(120), url: z.string().trim().regex(/^https:\/\/\S+$/, 'The link must start with https://').max(2000) });

/** Adds a mock test hosted elsewhere, e.g. a published Claude artifact. */
export const POST = route(async (req) => {
  await requireAdmin();
  const { title, url } = await readJson(req, body);
  await addMockLink(title, url);
  return ok({ saved: true });
});
