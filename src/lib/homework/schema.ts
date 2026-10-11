import { z } from 'zod';
import { HOMEWORK_LIMITS as LIMITS } from './limits';

const isoDate = z.iso.date('Use a YYYY-MM-DD date.');
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a HH:MM time.');

export const homeworkItemSchema = z.object({
  subjectCode: z.string().trim().min(1, 'Pick a subject.').max(LIMITS.code),
  subjectTitle: z.string().trim().min(1, 'Give the subject a name.').max(LIMITS.subjectTitle),
  title: z.string().trim().min(1, 'Say what the homework is.').max(LIMITS.title),
  details: z.string().trim().max(LIMITS.details).default(''),
  givenOn: isoDate,
  dueMode: z.enum(['next_class', 'date']),
  dueDate: isoDate.nullable().default(null),
  dueTime: clock.nullable().default(null),
});

export const postHomeworkSchema = z.object({
  items: z.array(homeworkItemSchema).min(1, 'Nothing to post.').max(LIMITS.batch, `Post at most ${LIMITS.batch} tasks at a time.`),
  notify: z.boolean().default(false),
});
