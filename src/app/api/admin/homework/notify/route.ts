import { z } from 'zod';
import { HttpError, ok, readJson, requireAdmin, route } from '@/lib/http';
import { homeworkByIds } from '@/lib/homework/repo';
import { HOMEWORK_LIMITS } from '@/lib/homework/limits';
import { notifyNewHomework } from '@/lib/notify';
import { pushConfigured } from '@/lib/push';
import { enforce } from '@/lib/rate-limit';

export const maxDuration = 60;

const body = z.object({
  ids: z.array(z.string().trim().min(1).max(100)).min(1, 'Pick the homework to send an alert about.').max(HOMEWORK_LIMITS.batch),
});

/**
 * Sends the "new homework" alert for homework that is already posted (for when it was added
 * without one). The same set of items is only ever announced once.
 */
export const POST = route(async (req) => {
  await requireAdmin();
  const { ids } = await readJson(req, body);
  if (!pushConfigured()) {
    throw new HttpError(409, 'Push notifications aren’t set up yet — see Evening reminder below.', 'push_off');
  }
  await enforce('homework-notify', 10, 600, 'Alerts were sent moments ago.');
  const items = await homeworkByIds([...new Set(ids)]);
  if (!items.length) throw new HttpError(404, 'That homework no longer exists.', 'not_found');
  const notified = await notifyNewHomework(items);
  return ok({ items: items.length, notified, alreadySent: notified === null });
});
