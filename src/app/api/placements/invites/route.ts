import { z } from 'zod';
import { sha256 } from '@/lib/crypto';
import { HttpError, ok, readJson, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { verifyInboxKey } from '@/lib/homework/inbox';
import { confirmInvite } from '@/lib/placements/repo';

export const dynamic = 'force-dynamic';

const body = z.object({ eventId: z.string().trim().min(1).max(100), calendarEventId: z.string().trim().min(1).max(300) });

/** The Apps Script calls this after creating a calendar event, so the invite isn't handed out again. */
export const POST = route(async (req) => {
  const key = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
  if (!(await verifyInboxKey(key))) {
    throw new HttpError(401, 'Unknown inbox key.', 'unauthorized');
  }
  await enforce(`placements-invites:${sha256(key!).slice(0, 12)}`, 120, 3600, 'Too many invite confirmations.');
  const { eventId, calendarEventId } = await readJson(req, body);
  await confirmInvite(eventId, calendarEventId);
  return ok({ ok: true });
});
