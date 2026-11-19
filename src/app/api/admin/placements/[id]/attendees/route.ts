import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { replaceAttendees } from '@/lib/placements/repo';

const body = z.object({ text: z.string().max(20_000) });

/** Replaces a pending PPT's attendees with the Section E roll numbers found in the pasted text. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const { text } = await readJson(req, body);
  return ok({ count: await replaceAttendees(id, text) });
});
