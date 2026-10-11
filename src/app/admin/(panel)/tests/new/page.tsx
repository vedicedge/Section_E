import type { Metadata } from 'next';
import { activePlanSummaries } from '@/lib/seating/repo';
import { QuizEditor } from '../QuizEditor';

export const metadata: Metadata = { title: 'New mock test · Admin' };

export default async function NewTest() {
  const plans = await activePlanSummaries();
  return (
    <QuizEditor
      subjects={[...new Set(plans.map((p) => p.code))]}
      initial={{
        id: null,
        status: 'draft',
        phase: 'draft',
        title: '',
        subject: null,
        description: '',
        instructions: '',
        durationMinutes: 30,
        opensAt: null,
        closesAt: null,
        maxAttempts: 1,
        shuffleQuestions: false,
        shuffleOptions: false,
        showAnswers: 'after_submit',
        negativeMarking: 0,
        questions: [],
        attempts: 0,
      }}
    />
  );
}
