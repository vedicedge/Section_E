import 'server-only';
import { json, query, queryOne } from '../db';
import { newId } from '../crypto';
import { getSetting, setSetting } from '../settings';
import { todayISO } from '../time';
import {
  cleanCovered,
  isRevisionOpen,
  normaliseSettings,
  type RevisionQuestionInput,
  type RevisionSettings,
} from './model';

const SETTINGS_KEY = 'revision';

export interface RevisionQuestion {
  id: string;
  subject: string;
  title: string;
  prompt: string;
  minutes: number;
  marks: number | null;
  modelAnswer: string;
  keyPoints: string[];
  createdAt: string;
}

export interface RevisionProgress {
  questionId: string;
  draft: string;
  covered: number[];
  revealedAt: string | null;
  nailedAt: string | null;
}

type QuestionRow = {
  id: string;
  subject: string;
  title: string;
  prompt: string;
  minutes: number;
  marks: number | null;
  model_answer: string;
  key_points: string[] | null;
  created_at: Date;
};

const COLUMNS = 'id, subject, title, prompt, minutes, marks, model_answer, key_points, created_at';
const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

function toQuestion(r: QuestionRow): RevisionQuestion {
  return {
    id: r.id,
    subject: r.subject,
    title: r.title,
    prompt: r.prompt,
    minutes: Number(r.minutes),
    marks: r.marks === null ? null : Number(r.marks),
    modelAnswer: r.model_answer,
    keyPoints: Array.isArray(r.key_points) ? r.key_points : [],
    createdAt: new Date(r.created_at).toISOString(),
  };
}

export async function getRevisionSettings(): Promise<RevisionSettings> {
  return normaliseSettings(await getSetting<RevisionSettings>(SETTINGS_KEY));
}

export async function saveRevisionSettings(settings: RevisionSettings) {
  await setSetting(SETTINGS_KEY, settings);
}

/** Whether students can see revision mode right now. Never throws: a failure counts as closed. */
export async function revisionOpenNow(): Promise<boolean> {
  try {
    return isRevisionOpen(await getRevisionSettings(), todayISO());
  } catch {
    return false;
  }
}

export async function listRevisionQuestions(): Promise<RevisionQuestion[]> {
  const rows = await query<QuestionRow>(`SELECT ${COLUMNS} FROM revision_questions ORDER BY subject, created_at, id`);
  return rows.map(toQuestion);
}

export async function getRevisionQuestion(id: string): Promise<RevisionQuestion | null> {
  const row = await queryOne<QuestionRow>(`SELECT ${COLUMNS} FROM revision_questions WHERE id = $1`, [id]);
  return row ? toQuestion(row) : null;
}

export async function addRevisionQuestions(items: RevisionQuestionInput[]): Promise<number> {
  // One statement, so a paste is added whole or not at all.
  if (!items.length) return 0;
  const values: unknown[] = [];
  const rows = items.map((q, i) => {
    values.push(newId(), q.subject, q.title, q.prompt, q.minutes, q.marks, q.modelAnswer, json(q.keyPoints));
    const b = i * 8;
    // created_at staggered by row so a paste keeps its order.
    return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6}, $${b + 7}, $${b + 8}::jsonb, now() + make_interval(secs => ${i} * 0.001))`;
  });
  await query(
    `INSERT INTO revision_questions (id, subject, title, prompt, minutes, marks, model_answer, key_points, created_at) VALUES ${rows.join(', ')}`,
    values,
  );
  return items.length;
}

export async function updateRevisionQuestion(id: string, q: RevisionQuestionInput): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `UPDATE revision_questions
     SET subject = $2, title = $3, prompt = $4, minutes = $5, marks = $6, model_answer = $7, key_points = $8::jsonb, updated_at = now()
     WHERE id = $1 RETURNING id`,
    [id, q.subject, q.title, q.prompt, q.minutes, q.marks, q.modelAnswer, json(q.keyPoints)],
  );
  return rows.length > 0;
}

export async function deleteRevisionQuestion(id: string) {
  await query('DELETE FROM revision_questions WHERE id = $1', [id]);
}

/** How many students have started each question (anonymous counts for the admin). */
export async function revisionActivity(): Promise<Record<string, { started: number; nailed: number }>> {
  const rows = await query<{ question_id: string; started: number; nailed: number }>(
    `SELECT question_id, count(*)::int AS started, count(nailed_at)::int AS nailed FROM revision_progress GROUP BY question_id`,
  );
  return Object.fromEntries(rows.map((r) => [r.question_id, { started: Number(r.started), nailed: Number(r.nailed) }]));
}

type ProgressRow = { question_id: string; draft: string; covered: unknown; revealed_at: Date | null; nailed_at: Date | null };

function toProgress(r: ProgressRow, keyPointCount = Number.MAX_SAFE_INTEGER): RevisionProgress {
  return {
    questionId: r.question_id,
    draft: r.draft,
    covered: cleanCovered(r.covered, keyPointCount),
    revealedAt: iso(r.revealed_at),
    nailedAt: iso(r.nailed_at),
  };
}

export async function progressFor(rollNo: string): Promise<Map<string, RevisionProgress>> {
  const rows = await query<ProgressRow>('SELECT question_id, draft, covered, revealed_at, nailed_at FROM revision_progress WHERE roll_no = $1', [rollNo]);
  return new Map(rows.map((r) => [r.question_id, toProgress(r)]));
}

export async function progressOn(rollNo: string, question: RevisionQuestion): Promise<RevisionProgress | null> {
  const row = await queryOne<ProgressRow>(
    'SELECT question_id, draft, covered, revealed_at, nailed_at FROM revision_progress WHERE roll_no = $1 AND question_id = $2',
    [rollNo, question.id],
  );
  return row ? toProgress(row, question.keyPoints.length) : null;
}

export interface ProgressChange {
  draft?: string;
  covered?: number[];
  revealed?: true;
  nailed?: boolean;
}

/** Saves part of a student's progress on one question; fields left out keep their value. */
export async function saveProgress(rollNo: string, question: RevisionQuestion, change: ProgressChange): Promise<RevisionProgress> {
  const covered = change.covered === undefined ? null : json(cleanCovered(change.covered, question.keyPoints.length));
  const nailed = change.nailed === undefined ? null : change.nailed;
  const row = await queryOne<ProgressRow>(
    `INSERT INTO revision_progress (roll_no, question_id, draft, covered, revealed_at, nailed_at)
     VALUES ($1, $2, COALESCE($3, ''), COALESCE($4::jsonb, '[]'::jsonb),
             CASE WHEN $5::boolean OR $6::boolean IS TRUE THEN now() END,
             CASE WHEN $6::boolean IS TRUE THEN now() END)
     ON CONFLICT (roll_no, question_id) DO UPDATE SET
       draft       = COALESCE($3, revision_progress.draft),
       covered     = COALESCE($4::jsonb, revision_progress.covered),
       revealed_at = COALESCE(revision_progress.revealed_at, CASE WHEN $5::boolean OR $6::boolean IS TRUE THEN now() END),
       nailed_at   = CASE WHEN $6::boolean IS NULL THEN revision_progress.nailed_at
                          WHEN $6::boolean THEN COALESCE(revision_progress.nailed_at, now())
                          ELSE NULL END,
       updated_at  = now()
     RETURNING question_id, draft, covered, revealed_at, nailed_at`,
    [rollNo, question.id, change.draft ?? null, covered, change.revealed === true, nailed],
  );
  return toProgress(row!, question.keyPoints.length);
}
