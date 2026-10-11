import { ok, route } from '@/lib/http';
import { clearAdminSession } from '@/lib/session';

export const POST = route(async () => {
  await clearAdminSession();
  return ok({ ok: true });
});
