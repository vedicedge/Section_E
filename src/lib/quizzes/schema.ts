import { z } from 'zod';

export const optionSchema = z.object({
  id: z.string().trim().min(1).max(24),
  text: z.string().trim().min(1, 'Options cannot be empty.').max(1000),
});

export const questionSchema = z
  .object({
    id: z.string().max(64).optional(),
    prompt: z.string().trim().min(1, 'Every question needs a prompt.').max(4000),
    options: z.array(optionSchema).min(2, 'Each question needs at least two options.').max(8),
    correct: z.array(z.string()).min(1, 'Mark the correct option for every question.'),
    multiple: z.boolean().default(false),
    points: z.number().min(0).max(100).default(1),
    explanation: z.string().max(4000).default(''),
  })
  .refine((q) => q.correct.every((c) => q.options.some((o) => o.id === c)), { message: 'A correct answer points to an option that does not exist.' })
  .refine((q) => q.multiple || q.correct.length === 1, { message: 'Single-answer questions need exactly one correct option.' })
  .refine((q) => new Set(q.options.map((o) => o.id)).size === q.options.length, { message: 'Option ids must be unique.' });

const isoOrNull = z.union([z.iso.datetime({ offset: true }), z.null()]);

export const quizInputSchema = z
  .object({
    title: z.string().trim().min(2, 'Give the test a title.').max(200),
    subject: z.string().trim().max(40).nullable().default(null),
    description: z.string().max(2000).default(''),
    instructions: z.string().max(8000).default(''),
    durationMinutes: z.number().int().min(1).max(600).nullable().default(null),
    opensAt: isoOrNull.default(null),
    closesAt: isoOrNull.default(null),
    maxAttempts: z.number().int().min(0).max(50).default(1),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    showAnswers: z.enum(['after_submit', 'after_close', 'never']).default('after_submit'),
    negativeMarking: z.number().min(0).max(1).default(0),
    questions: z.array(questionSchema).max(300),
  })
  .refine((q) => !q.opensAt || !q.closesAt || Date.parse(q.closesAt) > Date.parse(q.opensAt), {
    message: 'The closing time must be after the opening time.',
    path: ['closesAt'],
  });

export type QuizInput = z.infer<typeof quizInputSchema>;
export type QuestionInput = z.infer<typeof questionSchema>;

export const answersSchema = z.record(z.string().max(64), z.array(z.string().max(24)).max(8));
export const flaggedSchema = z.array(z.string().max(64)).max(300);
