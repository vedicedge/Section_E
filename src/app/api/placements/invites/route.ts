import { z } from 'zod';
import { sha256 } from '@/lib/crypto';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { verifyInboxKey } from '@/lib/homework/inbox';
import { confirmCancel, confirmInvite } from '@/lib/placements/repo';

export const dynamic = 'force-dynamic';

const eventId = z.string().trim().min(1).max(100);
const body = z.union([
  z.object({ eventId, calendarEventId: z.string().trim().min(1).max(300) }),
  z.object({ eventId, cancelled: z.literal(true) }),
]);

/**
 * The Apps Script calls this after creating or updating a calendar event (so the invite isn't handed out
 * again), and with `cancelled: true` after deleting the event of a withdrawn PPT.
 */
export const POST = route(async (req) => {
  const key = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
  if (!(await verifyInboxKey(key))) {
    throw new HttpError(401, 'Unknown inbox key.', 'unauthorized');
  }
  await enforce(`placements-invites:${sha256(key!).slice(0, 12)}`, 120, 3600, 'Too many invite confirmations.');
  const input = await readJson(req, body);
  if ('cancelled' in input) await confirmCancel(input.eventId);
  else await confirmInvite(input.eventId, input.calendarEventId);
  return ok({ ok: true });
});
