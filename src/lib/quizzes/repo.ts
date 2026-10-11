import 'server-only';
import { randomInt } from 'node:crypto';
import { json, query, queryOne, transaction } from '../db';
import { newId } from '../crypto';
import { HttpError } from '../http';
import { grade, shuffle, type GradeResult } from './grading';
import type { QuizInput } from './schema';

export type QuizPhase = 'draft' | 'upcoming' | 'live' | 'closed';

export interface QuizRecord {
  id: string;
  title: string;
  subject: string | null;
  description: string;
  instructions: string;
  durationMinutes: number | null;
  opensAt: string | null;
  closesAt: string | null;
  status: 'draft' | 'published';
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showAnswers: 'after_submit' | 'after_close' | 'never';
  negativeMarking: number;
  publishedAt: string | null;
  updatedAt: string;
  questionCount: number;
  totalPoints: number;
  phase: QuizPhase;
}

export interface QuestionRecord {
  id: string;
  position: number;
  prompt: string;
  options: { id: string; text: string }[];
  correct: string[];
  multiple: boolean;
  points: number;
  explanation: string;
}

interface QuizRow {
  id: string;
  title: string;
  subject: string | null;
  description: string;
  instructions: string;
  duration_minutes: number | null;
  opens_at: Date | null;
  closes_at: Date | null;
  status: 'draft' | 'published';
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  show_answers: QuizRecord['showAnswers'];
  negative_marking: number;
  published_at: Date | null;
  updated_at: Date;
  question_count?: number;
  total_points?: number;
}

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

export function phaseOf(q: { status: string; opensAt: string | null; closesAt: string | null }, now = Date.now()): QuizPhase {
  if (q.status !== 'published') return 'draft';
  if (q.opensAt && Date.parse(q.opensAt) > now) return 'upcoming';
  if (q.closesAt && Date.parse(q.closesAt) <= now) return 'closed';
  return 'live';
}

function toQuiz(row: QuizRow): QuizRecord {
  const base = {
    id: row.id,
    title: row.title,
    subject: row.subject,
    description: row.description,
    instructions: row.instructions,
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    opensAt: iso(row.opens_at),
    closesAt: iso(row.closes_at),
    status: row.status,
    maxAttempts: Number(row.max_attempts),
    shuffleQuestions: row.shuffle_questions,
    shuffleOptions: row.shuffle_options,
    showAnswers: row.show_answers,
    negativeMarking: Number(row.negative_marking),
    publishedAt: iso(row.published_at),
    updatedAt: new Date(row.updated_at).toISOString(),
    questionCount: Number(row.question_count ?? 0),
    totalPoints: Number(row.total_points ?? 0),
  };
  return { ...base, phase: phaseOf(base) };
}

const QUIZ_SELECT = `
  SELECT q.*,
    (SELECT count(*)::int FROM quiz_questions x WHERE x.quiz_id = q.id) AS question_count,
    (SELECT coalesce(sum(x.points), 0)::float8 FROM quiz_questions x WHERE x.quiz_id = q.id) AS total_points
  FROM quizzes q`;

export async function listQuizzes(): Promise<QuizRecord[]> {
  const rows = await query<QuizRow>(`${QUIZ_SELECT} ORDER BY q.updated_at DESC`);
  return rows.map(toQuiz);
}

/** Student-visible tests: published ones (upcoming, live and closed). */
export async function listPublishedQuizzes(): Promise<QuizRecord[]> {
  const rows = await query<QuizRow>(`${QUIZ_SELECT} WHERE q.status = 'published' ORDER BY coalesce(q.opens_at, q.published_at) DESC`);
  return rows.map(toQuiz);
}

export async function countLiveQuizzes(): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM quizzes WHERE status = 'published' AND (opens_at IS NULL OR opens_at <= now()) AND (closes_at IS NULL OR closes_at > now())`,
  );
  return Number(row?.n ?? 0);
}

export async function getQuiz(id: string): Promise<QuizRecord | null> {
  const row = await queryOne<QuizRow>(`${QUIZ_SELECT} WHERE q.id = $1`, [id]);
  return row ? toQuiz(row) : null;
}

export async function getQuestions(quizId: string): Promise<QuestionRecord[]> {
  const rows = await query<QuestionRecord & { position: number }>(
    `SELECT id, position, prompt, options, correct, multiple, points, explanation FROM quiz_questions WHERE quiz_id = $1 ORDER BY position`,
    [quizId],
  );
  return rows.map((r) => ({ ...r, position: Number(r.position), points: Number(r.points) }));
}

export async function saveQuiz(id: string | null, input: QuizInput): Promise<string> {
  const quizId = id ?? newId();
  await transaction(async (tx) => {
    if (id) {
      const res = await tx.query<{ id: string }>(
        `UPDATE quizzes SET title=$2, subject=$3, description=$4, instructions=$5, duration_minutes=$6, opens_at=$7, closes_at=$8,
           max_attempts=$9, shuffle_questions=$10, shuffle_options=$11, show_answers=$12, negative_marking=$13, updated_at=now()
         WHERE id=$1 RETURNING id`,
        [quizId, input.title, input.subject, input.description, input.instructions, input.durationMinutes, input.opensAt, input.closesAt,
          input.maxAttempts, input.shuffleQuestions, input.shuffleOptions, input.showAnswers, input.negativeMarking],
      );
      if (!res.rows.length) throw new HttpError(404, 'That test no longer exists.', 'not_found');
    } else {
      await tx.query(
        `INSERT INTO quizzes (id, title, subject, description, instructions, duration_minutes, opens_at, closes_at, max_attempts,
           shuffle_questions, shuffle_options, show_answers, negative_marking)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [quizId, input.title, input.subject, input.description, input.instructions, input.durationMinutes, input.opensAt, input.closesAt,
          input.maxAttempts, input.shuffleQuestions, input.shuffleOptions, input.showAnswers, input.negativeMarking],
      );
    }

    // Keep ids of questions that still exist so in-progress attempts stay consistent.
    const existing = await tx.query<{ id: string }>('SELECT id FROM quiz_questions WHERE quiz_id = $1', [quizId]);
    const existingIds = new Set(existing.rows.map((r) => r.id));
    const keep = new Set<string>();
    for (const [position, q] of input.questions.entries()) {
      const qid = q.id && existingIds.has(q.id) ? q.id : newId();
      keep.add(qid);
      await tx.query(
        `INSERT INTO quiz_questions (id, quiz_id, position, prompt, options, correct, multiple, points, explanation)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9)
         ON CONFLICT (id) DO UPDATE SET position=EXCLUDED.position, prompt=EXCLUDED.prompt, options=EXCLUDED.options,
           correct=EXCLUDED.correct, multiple=EXCLUDED.multiple, points=EXCLUDED.points, explanation=EXCLUDED.explanation`,
        [qid, quizId, position, q.prompt, json(q.options), json(q.correct), q.multiple, q.points, q.explanation],
      );
    }
    for (const old of existingIds) {
      if (!keep.has(old)) await tx.query('DELETE FROM quiz_questions WHERE id = $1', [old]);
    }
  });
  return quizId;
}

export async function setQuizStatus(id: string, status: 'draft' | 'published') {
  const quiz = await getQuiz(id);
  if (!quiz) throw new HttpError(404, 'That test no longer exists.', 'not_found');
  if (status === 'published' && quiz.questionCount === 0) throw new HttpError(422, 'Add at least one question before publishing.', 'empty');
  await query(
    `UPDATE quizzes SET status = $2, published_at = CASE WHEN $2 = 'published' THEN coalesce(published_at, now()) ELSE published_at END, updated_at = now() WHERE id = $1`,
    [id, status],
  );
}

export async function deleteQuiz(id: string) {
  await query('DELETE FROM quizzes WHERE id = $1', [id]);
}

/* ---------------------------------------------------------------- attempts */

export interface AttemptRecord {
  id: string;
  quizId: string;
  rollNo: string;
  startedAt: string;
  deadlineAt: string | null;
  submittedAt: string | null;
  autoSubmitted: boolean;
  questionOrder: { id: string; options: string[] }[];
  answers: Record<string, string[]>;
  flagged: string[];
  score: number | null;
  maxScore: number | null;
  result: GradeResult | null;
}

interface AttemptRow {
  id: string;
  quiz_id: string;
  roll_no: string;
  started_at: Date;
  deadline_at: Date | null;
  submitted_at: Date | null;
  auto_submitted: boolean;
  question_order: AttemptRecord['questionOrder'];
  answers: Record<string, string[]>;
  flagged: string[];
  score: number | null;
  max_score: number | null;
  result: GradeResult | null;
}

function toAttempt(r: AttemptRow): AttemptRecord {
  return {
    id: r.id,
    quizId: r.quiz_id,
    rollNo: r.roll_no,
    startedAt: new Date(r.started_at).toISOString(),
    deadlineAt: iso(r.deadline_at),
    submittedAt: iso(r.submitted_at),
    autoSubmitted: r.auto_submitted,
    questionOrder: r.question_order,
    answers: r.answers ?? {},
    flagged: r.flagged ?? [],
    score: r.score === null ? null : Number(r.score),
    maxScore: r.max_score === null ? null : Number(r.max_score),
    result: r.result,
  };
}

/** Seconds of network slack accepted after the deadline. */
export const GRACE_SECONDS = 20;

export async function getAttempt(id: string): Promise<AttemptRecord | null> {
  const row = await queryOne<AttemptRow>('SELECT * FROM quiz_attempts WHERE id = $1', [id]);
  return row ? toAttempt(row) : null;
}

export async function attemptsFor(quizId: string, rollNo: string): Promise<AttemptRecord[]> {
  const rows = await query<AttemptRow>('SELECT * FROM quiz_attempts WHERE quiz_id = $1 AND roll_no = $2 ORDER BY started_at DESC', [quizId, rollNo]);
  return rows.map(toAttempt);
}

export async function myAttemptSummaries(rollNo: string) {
  const rows = await query<{ quiz_id: string; id: string; submitted_at: Date | null; deadline_at: Date | null; score: number | null; max_score: number | null }>(
    `SELECT quiz_id, id, submitted_at, deadline_at, score, max_score FROM quiz_attempts WHERE roll_no = $1 ORDER BY started_at DESC`,
    [rollNo],
  );
  return rows.map((r) => ({
    quizId: r.quiz_id,
    id: r.id,
    submittedAt: iso(r.submitted_at),
    deadlineAt: iso(r.deadline_at),
    score: r.score === null ? null : Number(r.score),
    maxScore: r.max_score === null ? null : Number(r.max_score),
  }));
}

function expired(a: AttemptRecord, now = Date.now()) {
  return Boolean(a.deadlineAt && Date.parse(a.deadlineAt) + GRACE_SECONDS * 1000 < now);
}

/** Grades and closes an attempt. Idempotent: a submitted attempt is returned unchanged. */
export async function finalizeAttempt(attemptId: string, opts: { answers?: Record<string, string[]>; flagged?: string[]; auto?: boolean } = {}) {
  return transaction(async (tx) => {
    const { rows } = await tx.query<AttemptRow>('SELECT * FROM quiz_attempts WHERE id = $1 FOR UPDATE', [attemptId]);
    if (!rows[0]) throw new HttpError(404, 'Attempt not found.', 'not_found');
    const attempt = toAttempt(rows[0]);
    if (attempt.submittedAt) return attempt;

    const late = expired(attempt);
    // Answers sent after the deadline are ignored; the last autosave inside the window counts.
    const answers = !late && opts.answers ? opts.answers : attempt.answers;
    const flagged = !late && opts.flagged ? opts.flagged : attempt.flagged;
    const quiz = await tx.query<{ negative_marking: number }>('SELECT negative_marking FROM quizzes WHERE id = $1', [attempt.quizId]);
    const questions = await tx.query<{ id: string; correct: string[]; points: number }>(
      'SELECT id, correct, points FROM quiz_questions WHERE quiz_id = $1',
      [attempt.quizId],
    );
    const byId = new Map(questions.rows.map((q) => [q.id, { id: q.id, correct: q.correct, points: Number(q.points) }]));
    const ordered = attempt.questionOrder.map((o) => byId.get(o.id)).filter((q): q is NonNullable<typeof q> => Boolean(q));
    const result = grade(ordered, answers, Number(quiz.rows[0]?.negative_marking ?? 0));
    const auto = Boolean(opts.auto || late);
    const updated = await tx.query<AttemptRow>(
      `UPDATE quiz_attempts SET answers=$2::jsonb, flagged=$3::jsonb, submitted_at=now(), auto_submitted=$4, score=$5, max_score=$6, result=$7::jsonb
       WHERE id = $1 RETURNING *`,
      [attemptId, json(answers), json(flagged), auto, result.score, result.maxScore, json(result)],
    );
    return toAttempt(updated.rows[0]!);
  });
}

export async function startAttempt(quizId: string, rollNo: string): Promise<AttemptRecord> {
  const quiz = await getQuiz(quizId);
  if (!quiz || quiz.status !== 'published') throw new HttpError(404, 'This test is not available.', 'not_found');
  if (quiz.phase === 'upcoming') throw new HttpError(409, 'This test has not opened yet.', 'not_open');
  if (quiz.phase === 'closed') throw new HttpError(409, 'This test has closed.', 'closed');

  const attempts = await attemptsFor(quizId, rollNo);
  for (const a of attempts) {
    if (a.submittedAt) continue;
    if (!expired(a)) return a; // resume
    await finalizeAttempt(a.id, { auto: true });
  }
  const used = (await attemptsFor(quizId, rollNo)).length;
  if (quiz.maxAttempts > 0 && used >= quiz.maxAttempts) {
    throw new HttpError(409, quiz.maxAttempts === 1 ? 'You have already taken this test.' : `You have used all ${quiz.maxAttempts} attempts.`, 'no_attempts');
  }

  const questions = await getQuestions(quizId);
  if (!questions.length) throw new HttpError(409, 'This test has no questions yet.', 'empty');
  const random = () => randomInt(0, 2 ** 31) / 2 ** 31;
  const order = (quiz.shuffleQuestions ? shuffle(questions, random) : questions).map((q) => ({
    id: q.id,
    options: (quiz.shuffleOptions ? shuffle(q.options, random) : q.options).map((o) => o.id),
  }));

  const now = Date.now();
  const byDuration = quiz.durationMinutes ? now + quiz.durationMinutes * 60_000 : null;
  const byClose = quiz.closesAt ? Date.parse(quiz.closesAt) : null;
  const deadline = byDuration && byClose ? Math.min(byDuration, byClose) : (byDuration ?? byClose);

  const id = newId();
  const row = await queryOne<AttemptRow>(
    `INSERT INTO quiz_attempts (id, quiz_id, roll_no, deadline_at, question_order) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
    [id, quizId, rollNo, deadline ? new Date(deadline).toISOString() : null, json(order)],
  );
  return toAttempt(row!);
}

export async function saveProgress(attempt: AttemptRecord, answers: Record<string, string[]>, flagged: string[]) {
  if (attempt.submittedAt) throw new HttpError(409, 'This attempt was already submitted.', 'submitted');
  if (expired(attempt)) {
    await finalizeAttempt(attempt.id, { auto: true });
    throw new HttpError(409, 'Time is up — your answers were submitted automatically.', 'time_up');
  }
  const allowed = new Map(attempt.questionOrder.map((q) => [q.id, new Set(q.options)]));
  const clean: Record<string, string[]> = {};
  for (const [qid, opts] of Object.entries(answers)) {
    const valid = allowed.get(qid);
    if (!valid) continue;
    const picked = opts.filter((o) => valid.has(o));
    if (picked.length) clean[qid] = picked;
  }
  const flags = flagged.filter((f) => allowed.has(f));
  await query('UPDATE quiz_attempts SET answers = $2::jsonb, flagged = $3::jsonb WHERE id = $1 AND submitted_at IS NULL', [attempt.id, json(clean), json(flags)]);
  return { answers: clean, flagged: flags };
}

export async function resultsForQuiz(quizId: string) {
  const rows = await query<{
    id: string;
    roll_no: string;
    name: string | null;
    started_at: Date;
    submitted_at: Date | null;
    deadline_at: Date | null;
    auto_submitted: boolean;
    score: number | null;
    max_score: number | null;
    result: GradeResult | null;
  }>(
    `SELECT a.id, a.roll_no, s.name, a.started_at, a.submitted_at, a.deadline_at, a.auto_submitted, a.score, a.max_score, a.result
     FROM quiz_attempts a LEFT JOIN students s ON s.roll_no = a.roll_no
     WHERE a.quiz_id = $1 ORDER BY a.score DESC NULLS LAST, a.submitted_at`,
    [quizId],
  );
  return rows.map((r) => ({
    id: r.id,
    rollNo: r.roll_no,
    name: r.name,
    startedAt: new Date(r.started_at).toISOString(),
    submittedAt: iso(r.submitted_at),
    deadlineAt: iso(r.deadline_at),
    autoSubmitted: r.auto_submitted,
    score: r.score === null ? null : Number(r.score),
    maxScore: r.max_score === null ? null : Number(r.max_score),
    correct: r.result?.correct ?? null,
    wrong: r.result?.wrong ?? null,
    skipped: r.result?.skipped ?? null,
  }));
}

export async function deleteAttempt(id: string) {
  await query('DELETE FROM quiz_attempts WHERE id = $1', [id]);
}
