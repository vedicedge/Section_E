import { z } from 'zod';
import { ok, readJson, requireAdmin, route } from '@/lib/http';
import { claimSuggestion, linkSuggestion, releaseSuggestion } from '@/lib/homework/inbox';
import { createHomework } from '@/lib/homework/repo';
import { homeworkItemSchema } from '@/lib/homework/schema';
import { notifyNewHomework } from '@/lib/notify';
import type { SendResult } from '@/lib/push';

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 60;

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), item: homeworkItemSchema, notify: z.boolean().default(false) }),
  z.object({ action: z.literal('dismiss') }),
]);

/** Adds a suggested deadline to Homework (as edited by the admin), or dismisses it. */
export const POST = route<Ctx>(async (req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const input = await readJson(req, body);

  if (input.action === 'dismiss') {
    await claimSuggestion(id, 'dismissed');
    return ok({ ok: true });
  }

  await claimSuggestion(id, 'added');
  let created;
  try {
    created = await createHomework([input.item]);
  } catch (err) {
    // Keep the suggestion in the queue so the admin can fix the details and try again.
    await releaseSuggestion(id);
    throw err;
  }
  await linkSuggestion(id, created[0]!.id);

  let notified: SendResult | null = null;
  let notifyError: string | null = null;
  if (input.notify) {
    try {
      notified = await notifyNewHomework(created);
    } catch (err) {
      console.error('[section-e] new-homework notification failed', err);
      notifyError = 'The homework was added, but the notification could not be sent.';
    }
  }
  return ok({ created, notified, notifyError });
});
