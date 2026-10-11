import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getStudent } from '@/lib/session';
import { finalizeAttempt, getAttempt, getQuestions, getQuiz, GRACE_SECONDS } from '@/lib/quizzes/repo';
import { QuizRunner, type RunnerQuestion } from './QuizRunner';

export const metadata: Metadata = { title: 'Mock test in progress' };
export const dynamic = 'force-dynamic';

export default async function AttemptPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  const student = await getStudent();
  if (!student) redirect('/register?next=/tests');
  const attempt = await getAttempt(attemptId);
  if (!attempt || attempt.rollNo !== student.rollNo) notFound();
  if (attempt.submittedAt) redirect(`/tests/result/${attempt.id}`);
  if (attempt.deadlineAt && Date.parse(attempt.deadlineAt) + GRACE_SECONDS * 1000 < Date.now()) {
    await finalizeAttempt(attempt.id, { auto: true });
    redirect(`/tests/result/${attempt.id}`);
  }

  const [quiz, questions] = await Promise.all([getQuiz(attempt.quizId), getQuestions(attempt.quizId)]);
  if (!quiz) notFound();
  const byId = new Map(questions.map((q) => [q.id, q]));
  // Correct answers never leave the server while the attempt is open.
  const ordered: RunnerQuestion[] = attempt.questionOrder.flatMap((o) => {
    const q = byId.get(o.id);
    if (!q) return [];
    const options = o.options.map((id) => q.options.find((x) => x.id === id)).filter((x): x is { id: string; text: string } => Boolean(x));
    return [{ id: q.id, prompt: q.prompt, options, multiple: q.multiple, points: q.points }];
  });

  return (
    <QuizRunner
      attemptId={attempt.id}
      quizId={quiz.id}
      title={quiz.title}
      deadlineAt={attempt.deadlineAt}
      serverNow={Date.now()}
      questions={ordered}
      initialAnswers={attempt.answers}
      initialFlagged={attempt.flagged}
      negativeMarking={quiz.negativeMarking}
    />
  );
}
