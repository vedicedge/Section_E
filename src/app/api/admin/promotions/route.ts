import { HttpError, ok, requireAdmin, route } from '@/lib/http';
import { addPromotion } from '@/lib/extras';

const MAX = 3 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Adds an event poster (multipart: title, startsOn, endsOn, link?, file). */
export const POST = route(async (req) => {
  await requireAdmin();
  const form = await req.formData().catch(() => null);
  if (!form) throw new HttpError(400, 'Send the poster as a file upload.', 'bad_form');
  const title = String(form.get('title') ?? '').trim().slice(0, 120);
  const startsOn = String(form.get('startsOn') ?? '');
  const endsOn = String(form.get('endsOn') ?? '');
  const link = String(form.get('link') ?? '').trim() || null;
  const file = form.get('file');
  if (!title) throw new HttpError(422, 'Give the poster a title.', 'invalid');
  if (!DATE.test(startsOn) || !DATE.test(endsOn) || endsOn < startsOn) throw new HttpError(422, 'Pick a start date and an end date on or after it.', 'invalid');
  if (link && !/^https:\/\/\S+$/.test(link)) throw new HttpError(422, 'The link must start with https://', 'invalid');
  if (!(file instanceof File) || !TYPES.includes(file.type)) throw new HttpError(422, 'Choose a JPG, PNG, WebP or GIF image.', 'invalid');
  if (file.size > MAX) throw new HttpError(413, 'The image must be 3 MB or smaller.', 'too_large');
  await addPromotion({ title, startsOn, endsOn, link, mime: file.type, image: new Uint8Array(await file.arrayBuffer()) });
  return ok({ saved: true });
});
