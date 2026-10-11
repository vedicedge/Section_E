import { HttpError, requireAdmin, route } from '@/lib/http';
import { getQuiz, resultsForQuiz } from '@/lib/quizzes/repo';

function cell(v: unknown) {
  const s = v === null || v === undefined ? '' : String(v);
  // Quote everything and neutralise spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await requireAdmin();
  const { id } = await params;
  const quiz = await getQuiz(id);
  if (!quiz) throw new HttpError(404, 'Test not found.', 'not_found');
  const rows = await resultsForQuiz(id);
  const header = ['Roll No', 'Name', 'Score', 'Max', 'Correct', 'Wrong', 'Skipped', 'Started', 'Submitted', 'Auto-submitted'];
  const lines = [header, ...rows.map((r) => [r.rollNo, r.name, r.score, r.maxScore, r.correct, r.wrong, r.skipped, r.startedAt, r.submittedAt, r.autoSubmitted ? 'yes' : 'no'])];
  const csv = lines.map((l) => l.map(cell).join(',')).join('\r\n');
  const name = quiz.title.replace(/[^\w-]+/g, '_').slice(0, 60) || 'results';
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-results.csv"`,
      'Cache-Control': 'no-store',
    },
  });
});
