import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { resetAllAttendance } from '@/lib/attendance/repo';

const body = z.object({ confirm: z.literal('RESET') });

/** New term: clears every student's saved counts. The subjects stay. */
export const POST = route(async (req) => {
  await requireAdmin();
  await readJson(req, body);
  return ok({ deleted: await resetAllAttendance() });
});
