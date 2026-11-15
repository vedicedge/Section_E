import { z } from 'zod';
import { ok, readJson, requireStudent, route } from '@/lib/http';
import { markSeen } from '@/lib/announcements';

const body = z.object({ ids: z.array(z.string().min(1).max(64)).max(50) });

/** The home-page banner's "Got it": counts this student as having seen those announcements. */
export const POST = route(async (req) => {
  const student = await requireStudent();
  const { ids } = await readJson(req, body);
  await markSeen(student.rollNo, ids);
  return ok({ saved: true });
});
