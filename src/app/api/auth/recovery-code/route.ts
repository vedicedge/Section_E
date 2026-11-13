import { ok, requireStudent, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { issueRecoveryCode } from '@/lib/students';

/** The signed-in student gets a new recovery code (shown once); any earlier code stops working. */
export const POST = route(async () => {
  const student = await requireStudent();
  await enforce(`recovery-code:${student.rollNo}`, 10, 60 * 60);
  return ok({ code: await issueRecoveryCode(student.rollNo) });
});
