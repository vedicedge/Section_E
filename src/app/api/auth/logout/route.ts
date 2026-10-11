import { ok, route } from '@/lib/http';
import { clearStudentSession } from '@/lib/session';

export const POST = route(async () => {
  await clearStudentSession();
  return ok({ ok: true });
});
