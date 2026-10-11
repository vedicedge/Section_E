import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { queryOne } from '@/lib/db';
import { activePlanSummaries } from '@/lib/seating/repo';
import { getQuestions, getQuiz } from '@/lib/quizzes/repo';
import { QuizEditor } from '../QuizEditor';

export const metadata: Metadata = { title: 'Edit mock test · Admin' };

export default async function EditTest({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { saved } = await searchParams;
  const [quiz, questions, plans, count] = await Promise.all([
    getQuiz(id),
    getQuestions(id),
    activePlanSummaries(),
    queryOne<{ n: number }>('SELECT count(*)::int AS n FROM quiz_attempts WHERE quiz_id = $1 AND submitted_at IS NOT NULL', [id]),
  ]);
  if (!quiz) notFound();
  return (
    <QuizEditor
      flash={saved === 'published' ? 'Saved and published.' : saved === 'draft' ? 'Saved as a draft.' : null}
      subjects={[...new Set(plans.map((p) => p.code))]}
      initial={{
        ...quiz,
        questions: questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options,
          correct: q.correct,
          multiple: q.multiple,
          points: q.points,
          explanation: q.explanation,
        })),
        attempts: Number(count?.n ?? 0),
      }}
    />
  );
}
