import { z } from 'zod';
import { ok, readJson, requireStudent, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { removeSubscription } from '@/lib/push';

const body = z.object({ endpoint: z.string().min(1).max(1000) });

/** Forgets this device's subscription — only if it belongs to the signed-in student. */
export const POST = route(async (req) => {
  const student = await requireStudent();
  const { endpoint } = await readJson(req, body);
  await enforce(`push-unsub:${student.rollNo}`, 30, 60 * 60, 'Too many reminder changes.');
  await removeSubscription(endpoint, student.rollNo);
  return ok({ subscribed: false });
});
