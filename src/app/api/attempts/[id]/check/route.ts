import { z } from 'zod';
import { ok, readJson, requireStudent, route } from '@/lib/http';
import { revealAnswer } from '@/lib/quizzes/repo';

const body = z.object({ questionId: z.string().min(1).max(64), chosen: z.array(z.string().max(24)).min(1).max(8) });

/**
 * Instant feedback: the student checks one question. The answer is locked and the correct answer
 * and explanation for that question only are returned. Refused unless the quiz is set to show
 * answers after each question.
 */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const student = await requireStudent();
  const { id } = await params;
  const { questionId, chosen } = await readJson(req, body);
  return ok(await revealAnswer(id, student.rollNo, questionId, chosen));
});
