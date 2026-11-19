import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { pptSummary } from '@/lib/placements/format';
import { approvePlacement, dismissPlacement } from '@/lib/placements/repo';
import { pushConfigured, sendPush } from '@/lib/push';

const date = z.string().trim().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Pick a valid date.');
const time = z.string().trim().regex(/^(\d{2}:\d{2})?$/, 'Pick a valid time.');

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('dismiss') }),
  z.object({
    action: z.literal('approve'),
    edits: z
      .object({
        title: z.string().trim().min(1, 'Give it a title.').max(120).optional(),
        date: date.optional(),
        time: time.optional(),
        // An empty end time means "not given", so it is left as it was.
        endTime: time.optional(),
        venue: z.string().trim().max(200).optional(),
        notes: z.string().trim().max(2000).optional(),
      })
      .default({}),
  }),
]);

/** Approves a pending PPT (and tells the listed students) or dismisses it. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const input = await readJson(req, body);
  if (input.action === 'dismiss') {
    await dismissPlacement(id);
    return ok({ status: 'dismissed' as const, pushed: 0 });
  }
  const view = await approvePlacement(id, { ...input.edits, endTime: input.edits.endTime || undefined });
  let pushed = 0;
  if (pushConfigured() && view.attendees.length && view.date && view.time) {
    try {
      const res = await sendPush(
        view.attendees.map((a) => a.rollNo),
        {
          title: "You're on the attendee list",
          body: pptSummary({ title: view.title, date: view.date, time: view.time, venue: view.venue }),
          url: '/',
          tag: `placement-${view.id}`,
        },
      );
      pushed = res.sent;
    } catch (err) {
      // The PPT is approved either way; the card says nobody was notified.
      console.error('Placement push failed:', err);
    }
  }
  return ok({ status: view.status, pushed });
});
