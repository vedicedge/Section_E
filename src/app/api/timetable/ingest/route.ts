import { z, ZodError } from 'zod';
import { sha256 } from '@/lib/crypto';
import { fail, HttpError, ok } from '@/lib/http';
import { enforce } from '@/lib/rate-limit';
import { getTimetableConfig, ingestWorkbook, relayHeartbeat, verifyRelayKey } from '@/lib/timetable/service';
import { SourceError } from '@/lib/timetable/source';
import { looksLikeXlsx } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_BASE64 = 21_000_000;

const body = z.object({
  fileName: z.string().max(255).optional(),
  modifiedAt: z.iso.datetime({ offset: true }).optional(),
  data: z.base64('data must be base64.').max(MAX_BASE64).optional(),
});

/** One spelling of each instant, so heartbeats compare equal to the copy we stored. */
function normaliseTime(value: string | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * Called by the Google Apps Script relay in the admin's Google account (server to server, so no
 * Origin header and no cookies). Without `data` it is a heartbeat: we answer whether we need the file.
 */
export async function POST(req: Request) {
  try {
    const key = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') ?? '')?.[1] ?? null;
    if (!(await verifyRelayKey(key))) {
      throw new HttpError(401, 'Unknown relay key. Generate a new setup script in /admin/timetable and paste it into Apps Script.', 'unauthorized');
    }
    await enforce(`relay:${sha256(key!).slice(0, 12)}`, 240, 3600, 'The relay is sending too often.');

    const config = await getTimetableConfig();
    if (config.mode !== 'relay') {
      throw new HttpError(409, 'The site is not in relay mode — switch the timetable source to the Apps Script relay in /admin/timetable.', 'relay_off');
    }

    if (Number(req.headers.get('content-length') ?? 0) > MAX_BASE64 + 4096) {
      throw new HttpError(413, 'The timetable file is larger than 15 MB.', 'too_large');
    }
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      throw new HttpError(400, 'Request body must be JSON.', 'bad_json');
    }
    const { fileName, modifiedAt, data } = body.parse(json);
    const modified = normaliseTime(modifiedAt);

    if (data === undefined) {
      const upToDate = await relayHeartbeat(modified);
      return ok({ ok: true, needFile: !upToDate });
    }

    const bytes = Buffer.from(data, 'base64');
    if (bytes.length > MAX_BYTES) throw new HttpError(422, 'The timetable file is larger than 15 MB.', 'too_large');
    if (!looksLikeXlsx(bytes)) throw new HttpError(422, 'The file the relay sent is not an Excel (.xlsx) workbook.', 'not_xlsx');

    const state = await ingestWorkbook('relay', { bytes, fileName: fileName ?? null, modifiedAt: modified, via: 'Apps Script relay' });
    const parsed = state.status === 'ok' || state.status === 'stale' ? state.data : null;
    return ok({ ok: true, needFile: false, sessions: parsed?.sessions.length ?? 0, detected: parsed?.detection.ok ?? false });
  } catch (err) {
    if (err instanceof HttpError) return fail(err.status, err.message, err.code, err.extra);
    if (err instanceof SourceError) return fail(422, err.message, err.code);
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const where = first?.path.length ? `${first.path.join('.')}: ` : '';
      return fail(422, `${where}${first?.message ?? 'Invalid input.'}`, 'invalid');
    }
    console.error('[section-e] timetable relay ingest failed', err);
    return fail(500, 'Something went wrong on our side. The relay will try again on its next run.', 'internal');
  }
}
