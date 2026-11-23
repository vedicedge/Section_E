import { z } from 'zod';
import { HttpError, ok, readJson, requireAdmin, route } from '@/lib/http';
import { parseRevisionBulk, revisionQuestionSchema } from '@/lib/revision/model';
import { addRevisionQuestions } from '@/lib/revision/repo';

const body = z.union([
  z.object({ question: revisionQuestionSchema }),
  z.object({ bulk: z.string().max(400_000), subject: z.string().trim().max(40).optional() }),
]);

/** Adds one revision question, or a pasted batch (all or nothing). */
export const POST = route(async (req) => {
  await requireAdmin();
  const input = await readJson(req, body);
  if ('question' in input) {
    await addRevisionQuestions([input.question]);
    return ok({ added: 1 });
  }
  const { items, errors } = parseRevisionBulk(input.bulk, { subject: input.subject || undefined });
  if (errors.length) throw new HttpError(422, errors.slice(0, 3).join(' '), 'invalid', { errors });
  if (items.length > 200) throw new HttpError(422, 'At most 200 questions per paste.', 'too_many');
  return ok({ added: await addRevisionQuestions(items) });
});
