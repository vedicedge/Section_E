import { ok, requireAdmin, route } from '@/lib/http';
import { sendDueReminders } from '@/lib/notify';
import { enforce } from '@/lib/rate-limit';

export const maxDuration = 60;

/** The admin's "send tomorrow's reminder now" — runs even if tonight's scheduled one already went out. */
export const POST = route(async () => {
  await requireAdmin();
  await enforce('homework-remind-now', 3, 600, 'Reminders were sent moments ago.');
  return ok(await sendDueReminders({ force: true }));
});
