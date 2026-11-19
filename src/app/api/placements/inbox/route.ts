import { z } from 'zod';
import { sha256 } from '@/lib/crypto';
import { HttpError, ok, route } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { verifyInboxKey } from '@/lib/homework/inbox';
import { ingestPlacementEmails, inviteTasks } from '@/lib/placements/repo';
import { sendPlacementReminders } from '@/lib/placements/reminders';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const email = z.object({
  id: z.string().trim().min(1).max(200),
  threadUrl: z
    .string()
    .max(500)
    .refine((u) => u.startsWith('https://mail.google.com/'), 'threadUrl must be a Gmail link.')
    .nullable()
    .default(null),
  subject: z.string().max(500).default(''),
  receivedAt: z.iso.datetime({ offset: true }),
  body: z.string().max(20_000).default(''),
  attachments: z
    .array(z.object({ name: z.string().max(300), dataBase64: z.string().max(3_000_000) }))
    .max(5)
    .default([]),
});

const body = z.object({ emails: z.array(email).max(10) });

/**
 * Called every 30 minutes by the admin's Apps Script (same inbox key as the homework inbox).
 * Stores new placement emails as pending, sends any reminders that are due, and hands back the
 * calendar invites the script should create. An empty list is a check-in.
 */
export const POST = route(async (req) => {
  const key = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
  if (!(await verifyInboxKey(key))) {
    throw new HttpError(401, 'Unknown inbox key. Generate a new setup script in Admin → Homework and paste it into Apps Script.', 'unauthorized');
  }
  await enforce(`placements-inbox:${sha256(key!).slice(0, 12)}`, 120, 3600, 'The placement inbox is sending too often.');
  if (Number(req.headers.get('content-length') ?? 0) > 4_000_000) {
    throw new HttpError(413, 'Send at most 10 emails at a time, 4 MB in all.', 'too_large');
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be JSON.', 'bad_json');
  }
  const { emails } = body.parse(json);
  const result = await ingestPlacementEmails(emails);
  const now = new Date();
  await sendPlacementReminders(now);
  return ok({ ok: true, ...result, invites: await inviteTasks(now) });
});
