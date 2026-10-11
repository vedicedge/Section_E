import { z } from 'zod';
import { HttpError, ok, readJson, requireStudent, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { saveSubscription } from '@/lib/push';

/**
 * The server POSTs to whatever endpoint is stored here, so only the browsers' own push services
 * are accepted (Chrome/Android, Firefox, Safari, Edge) — never an arbitrary or internal URL.
 */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

function isPushService(endpoint: string): boolean {
  const host = new URL(endpoint).hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

const body = z.object({
  subscription: z.object({
    endpoint: z.url({ protocol: /^https$/ }).max(1000),
    keys: z.object({
      p256dh: z.string().min(1).max(200),
      auth: z.string().min(1).max(100),
    }),
  }),
});

/** Saves this device's push subscription for the signed-in student (re-binding it if it existed). */
export const POST = route(async (req) => {
  const student = await requireStudent();
  const { subscription } = await readJson(req, body);
  if (!isPushService(subscription.endpoint)) {
    throw new HttpError(422, 'This browser’s notification service isn’t supported. Try Chrome, Edge, Firefox or Safari.', 'unsupported_push');
  }
  await enforce(`push-sub:${student.rollNo}`, 20, 60 * 60, 'Too many reminder changes.');
  await saveSubscription(student.rollNo, subscription, req.headers.get('user-agent'));
  return ok({ subscribed: true });
});
