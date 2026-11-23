import { z } from 'zod';
import { HttpError, clientIp, ok, readJson, route } from '@/lib/http';
import { assertWithinBudget, enforce, recordFailure } from '@/lib/rate-limit';
import { ADMIN_FAILURE_BUDGETS } from '@/lib/login-budgets';
import { isAdminConfigured, setAdminSession, verifyAdminPassword } from '@/lib/session';

const body = z.object({ password: z.string().min(1).max(200) });

export const POST = route(async (req) => {
  if (!isAdminConfigured()) throw new HttpError(503, 'Admin access is not configured. Set ADMIN_PASSWORD_HASH (or ADMIN_PASSWORD) on the server.', 'unconfigured');
  await enforce(`admin-login:${clientIp(req)}`, 8, 15 * 60, 'Too many sign-in attempts.');
  await assertWithinBudget(ADMIN_FAILURE_BUDGETS, 'Too many wrong admin passwords recently.');
  const { password } = await readJson(req, body);
  if (!(await verifyAdminPassword(password))) {
    await recordFailure(ADMIN_FAILURE_BUDGETS);
    throw new HttpError(401, 'Wrong password.', 'wrong_password');
  }
  await setAdminSession();
  return ok({ ok: true });
});
