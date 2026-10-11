import { ok, requireStudent, route } from '@/lib/http';
import { startAttempt } from '@/lib/quizzes/repo';

/** Starts (or resumes) the signed-in student's attempt. The server owns the clock. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const student = await requireStudent();
  const { id } = await params;
  const attempt = await startAttempt(id, student.rollNo);
  return ok({ attemptId: attempt.id, deadlineAt: attempt.deadlineAt });
});
