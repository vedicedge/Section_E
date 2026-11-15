import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { createAnnouncement } from '@/lib/announcements';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .default('')
    .transform((v) => v || null);

const body = z.object({
  title: z.string().trim().min(1, 'Give it a title.').max(120),
  body: z.string().trim().max(2000).default(''),
  link: optionalText(2000).refine((v) => v === null || /^https:\/\/\S+$/.test(v), 'The link must start with https://'),
  expiresOn: optionalText(10).refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Pick a valid date.'),
  notify: z.boolean().default(true),
});

/** Posts an announcement and (by default) pushes it to every subscribed device. */
export const POST = route(async (req) => {
  await requireAdmin();
  const input = await readJson(req, body);
  // A double-tap on "Post" must not notify the whole section twice.
  await enforce('announcement-post', 1, 20, 'An announcement was just posted. Wait a few seconds before posting another.');
  return ok(await createAnnouncement(input));
});
