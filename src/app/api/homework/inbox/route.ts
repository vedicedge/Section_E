import { z } from 'zod';
import { sha256 } from '@/lib/crypto';
import { HttpError, ok, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { ingestEmails, verifyInboxKey } from '@/lib/homework/inbox';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const email = z.object({
  id: z.string().trim().min(1).max(200),
  // Shown to the admin as "Open email", so only Gmail links are accepted.
  threadUrl: z
    .string()
    .max(500)
    .refine((u) => u.startsWith('https://mail.google.com/'), 'threadUrl must be a Gmail link.')
    .nullable()
    .default(null),
  from: z.email().max(320),
  fromName: z.string().trim().max(200).default(''),
  subject: z.string().max(500).default(''),
  receivedAt: z.iso.datetime({ offset: true }),
  body: z.string().max(20_000).default(''),
});

const body = z.object({ emails: z.array(email).max(25) });

/**
 * Called every 30 minutes by the homework-inbox Apps Script in the admin's college mailbox
 * (server to server, so no cookies). An empty list is a check-in.
 */
export const POST = route(async (req) => {
  const key = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
  if (!(await verifyInboxKey(key))) {
    throw new HttpError(401, 'Unknown inbox key. Generate a new setup script in Admin → Homework and paste it into Apps Script.', 'unauthorized');
  }
  await enforce(`inbox:${sha256(key!).slice(0, 12)}`, 120, 3600, 'The homework inbox is sending too often.');
  if (Number(req.headers.get('content-length') ?? 0) > 1_000_000) {
    throw new HttpError(413, 'Send at most 25 emails at a time.', 'too_large');
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be JSON.', 'bad_json');
  }
  const { emails } = body.parse(json);
  const result = await ingestEmails(emails);
  return ok({ ok: true, ...result });
});
