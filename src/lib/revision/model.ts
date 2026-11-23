import { z } from 'zod';

/**
 * Revision mode: written-answer practice for the end-term exams (application-based answer writing).
 * The admin adds questions with a model answer and key points; students write against a timer, then
 * reveal the model answer and tick the key points they covered. Pure helpers (no database) live here.
 */

export const REVISION_DEFAULT_OPENS_ON = '2026-12-15';

export type RevisionMode = 'auto' | 'on' | 'off';

export interface RevisionSettings {
  /** auto: opens for students on `opensOn`; on: open now; off: hidden whatever the date. */
  mode: RevisionMode;
  opensOn: string;
}

export const DEFAULT_REVISION_SETTINGS: RevisionSettings = { mode: 'auto', opensOn: REVISION_DEFAULT_OPENS_ON };

export const revisionSettingsSchema = z.object({
  mode: z.enum(['auto', 'on', 'off']),
  opensOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date.'),
});

export function normaliseSettings(value: unknown): RevisionSettings {
  const parsed = revisionSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_REVISION_SETTINGS;
}

/** Whether students can see revision mode today (`today` is a YYYY-MM-DD date in the app's time zone). */
export function isRevisionOpen(settings: RevisionSettings, today: string): boolean {
  if (settings.mode === 'on') return true;
  if (settings.mode === 'off') return false;
  return today >= settings.opensOn;
}

export const MAX_KEY_POINTS = 20;
export const MAX_DRAFT_CHARS = 20000;

export const revisionQuestionSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, 'Give the subject (e.g. SM).')
    .max(40)
    .transform((v) => v.toUpperCase()),
  title: z.string().trim().min(1, 'Give the question a short title.').max(160),
  prompt: z.string().trim().min(1, 'Write the question or case.').max(12000),
  minutes: z.coerce.number().int('Minutes must be a whole number.').min(1, 'At least 1 minute.').max(180, 'At most 180 minutes.'),
  marks: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : v),
    z.coerce.number().int().min(1).max(100).nullable(),
  ),
  modelAnswer: z.string().trim().min(1, 'Add the model answer.').max(20000),
  keyPoints: z
    .array(z.string().trim().max(300))
    .max(MAX_KEY_POINTS, `At most ${MAX_KEY_POINTS} key points.`)
    .transform((pts) => pts.filter(Boolean)),
});

export type RevisionQuestionInput = z.infer<typeof revisionQuestionSchema>;

/** Splits a key-points box (one per line, bullets allowed) into points. */
export function splitKeyPoints(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}

const FIELD = /^(subject|title|minutes|time|marks|question|case|model answer|answer|key points|points)\s*:\s*(.*)$/i;

type Field = 'subject' | 'title' | 'minutes' | 'marks' | 'prompt' | 'modelAnswer' | 'keyPoints';

function fieldOf(name: string): Field {
  const n = name.toLowerCase();
  if (n === 'subject') return 'subject';
  if (n === 'title') return 'title';
  if (n === 'minutes' || n === 'time') return 'minutes';
  if (n === 'marks') return 'marks';
  if (n === 'question' || n === 'case') return 'prompt';
  if (n === 'model answer' || n === 'answer') return 'modelAnswer';
  return 'keyPoints';
}

export interface BulkResult {
  items: RevisionQuestionInput[];
  errors: string[];
}

/**
 * Reads pasted questions. Questions are separated by a line of three or more dashes; each one has
 * "Label: value" lines, where Question, Model answer and Key points may run over several lines:
 *
 *   Subject: SM
 *   Title: Five forces for a D2C brand
 *   Minutes: 15
 *   Question:
 *   A D2C skincare brand…
 *   Model answer:
 *   …
 *   Key points:
 *   - Threat of new entrants is high
 *   ---
 */
export function parseRevisionBulk(text: string, defaults: { subject?: string; minutes?: number } = {}): BulkResult {
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/^\s*-{3,}\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean);
  const items: RevisionQuestionInput[] = [];
  const errors: string[] = [];
  blocks.forEach((block, i) => {
    const fields: Partial<Record<Field, string>> = {};
    let current: Field | null = null;
    for (const line of block.split('\n')) {
      const m = FIELD.exec(line.trim());
      if (m) {
        current = fieldOf(m[1]!);
        fields[current] = m[2]!.trim();
      } else if (current) {
        fields[current] = fields[current] ? `${fields[current]}\n${line}` : line;
      }
    }
    const parsed = revisionQuestionSchema.safeParse({
      subject: fields.subject || defaults.subject || '',
      title: fields.title || firstLine(fields.prompt) || '',
      prompt: fields.prompt ?? '',
      minutes: fields.minutes ? fields.minutes.replace(/[^\d]/g, '') : (defaults.minutes ?? 15),
      marks: fields.marks ? fields.marks.replace(/[^\d]/g, '') : null,
      modelAnswer: fields.modelAnswer ?? '',
      keyPoints: splitKeyPoints(fields.keyPoints ?? ''),
    });
    if (parsed.success) items.push(parsed.data);
    else errors.push(`Question ${i + 1}: ${parsed.error.issues[0]?.message ?? 'could not read it.'}`);
  });
  if (!blocks.length) errors.push('Nothing to add. Paste at least one question.');
  return { items, errors };
}

function firstLine(text: string | undefined): string {
  const line = (text ?? '').trim().split('\n')[0] ?? '';
  return line.length > 80 ? `${line.slice(0, 77).trimEnd()}…` : line;
}

export type RevisionStatus = 'new' | 'drafted' | 'checked' | 'nailed';

export function statusOf(p: { draft: string; revealedAt: string | null; nailedAt: string | null } | undefined): RevisionStatus {
  if (!p) return 'new';
  if (p.nailedAt) return 'nailed';
  if (p.revealedAt) return 'checked';
  return p.draft.trim() ? 'drafted' : 'new';
}

/** Ticked key points, kept only while they still point at an existing key point. */
export function cleanCovered(covered: unknown, keyPointCount: number): number[] {
  if (!Array.isArray(covered)) return [];
  return [...new Set(covered.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < keyPointCount))].sort((a, b) => a - b);
}

export function wordCount(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
