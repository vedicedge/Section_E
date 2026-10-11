import { z } from 'zod';
import { HttpError, ok, readJson, requireAdmin, route } from '@/lib/http';
import { getTimetable, getTimetableDiagnostics, saveTimetableConfig } from '@/lib/timetable/service';
import { parseSourceUrl, SourceError } from '@/lib/timetable/source';

const body = z.object({
  url: z.string().trim().max(2000),
  section: z.string().trim().regex(/^[A-Ja-j]$/, 'Section must be a single letter (A–J).'),
});

/** Save the timetable source (takes effect immediately, no redeploy). */
export const PUT = route(async (req) => {
  await requireAdmin();
  const { url, section } = await readJson(req, body);
  if (url) {
    try {
      parseSourceUrl(url);
    } catch (err) {
      throw new HttpError(422, err instanceof SourceError ? err.message : 'Invalid link.', 'invalid_url');
    }
  }
  await saveTimetableConfig({ url: url || null, section: section.toUpperCase() });
  const state = url ? await getTimetable({ force: true }) : null;
  return ok({ diagnostics: await getTimetableDiagnostics(), status: state?.status ?? 'unconfigured' });
});

/** Force a refresh and return diagnostics. */
export const POST = route(async () => {
  await requireAdmin();
  const state = await getTimetable({ force: true });
  return ok({ diagnostics: await getTimetableDiagnostics(), status: state.status });
});
