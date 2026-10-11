import { z } from 'zod';
import { HttpError, ok, readJson, requireAdmin, route } from '@/lib/http';
import { getTimetable, getTimetableConfig, getTimetableDiagnostics, saveTimetableConfig, type TimetableConfig, type TimetableState } from '@/lib/timetable/service';
import { parseSourceUrl, SourceError } from '@/lib/timetable/source';

export const dynamic = 'force-dynamic';

const body = z.object({
  enabled: z.boolean().optional(),
  mode: z.enum(['link', 'relay', 'upload']).optional(),
  url: z.string().trim().max(2000).optional(),
  section: z
    .string()
    .trim()
    .regex(/^[A-Ja-j]$/, 'Section must be a single letter (A–J).')
    .optional(),
});

function outcome(state: TimetableState | null) {
  return {
    status: state?.status ?? null,
    error: state && 'error' in state ? (state.error ?? null) : null,
  };
}

/** Save the timetable settings (on/off, source, link, section). Takes effect immediately. */
export const PUT = route(async (req) => {
  await requireAdmin();
  const input = await readJson(req, body);
  const mode = input.mode ?? (await getTimetableConfig()).mode;

  if (input.url) {
    let parsed;
    try {
      parsed = parseSourceUrl(input.url);
    } catch (err) {
      throw new HttpError(422, err instanceof SourceError ? err.message : 'That does not look like a link.', 'invalid_url');
    }
    if (mode === 'relay' && parsed.kind !== 'google') {
      throw new HttpError(422, 'The relay works with Google Sheets and Google Drive files. Paste the link from the address bar while the timetable is open.', 'not_google');
    }
  }

  const patch: Partial<TimetableConfig> = {};
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.mode !== undefined) patch.mode = input.mode;
  if (input.url !== undefined) patch.url = input.url || null;
  if (input.section !== undefined) patch.section = input.section.toUpperCase();
  await saveTimetableConfig(patch);

  const config = await getTimetableConfig();
  const state = config.enabled && config.mode === 'link' && config.url ? await getTimetable({ force: true }) : null;
  return ok({ diagnostics: await getTimetableDiagnostics(), ...outcome(state) });
});

/** Re-read the source now (downloads in link mode; relay and upload copies are only re-checked). */
export const POST = route(async () => {
  await requireAdmin();
  const state = await getTimetable({ force: true });
  return ok({ diagnostics: await getTimetableDiagnostics(), ...outcome(state) });
});
