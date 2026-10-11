import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { createHomework } from '@/lib/homework/repo';
import { notifyNewHomework } from '@/lib/notify';
import type { SendResult } from '@/lib/push';
import { postHomeworkSchema } from '@/lib/homework/schema';

export const maxDuration = 60;

/** Posts one or more homework items (the admin's end-of-day board), optionally pinging students. */
export const POST = route(async (req) => {
  await requireAdmin();
  const { items, notify } = await readJson(req, postHomeworkSchema);
  const created = await createHomework(items);
  let notified: SendResult | null = null;
  let notifyError: string | null = null;
  if (notify) {
    try {
      notified = await notifyNewHomework(created);
    } catch (err) {
      // The homework is saved either way; a push outage must not lose the admin's work.
      console.error('[section-e] new-homework notification failed', err);
      notifyError = 'The homework was posted, but the notification could not be sent.';
    }
  }
  return ok({ created, notified, notifyError });
});
