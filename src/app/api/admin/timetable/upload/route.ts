import { HttpError, ok, requireAdmin, route } from '@/lib/http';
import { getTimetableConfig, getTimetableDiagnostics, ingestWorkbook, saveTimetableConfig } from '@/lib/timetable/service';
import { SourceError } from '@/lib/timetable/source';
import { looksLikeXlsx } from '@/lib/xlsx';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_UPLOAD = 15 * 1024 * 1024;

/** Manual upload: the admin sends the .xlsx whenever the official sheet changes. */
export const POST = route(async (req) => {
  await requireAdmin();
  if (Number(req.headers.get('content-length') ?? 0) > MAX_UPLOAD + 64 * 1024) {
    throw new HttpError(413, 'That file is larger than 15 MB.', 'too_large');
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, 'Send the workbook as a file upload.', 'bad_form');
  }
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) throw new HttpError(422, 'Choose the timetable .xlsx file first.', 'no_file');
  if (file.size > MAX_UPLOAD) throw new HttpError(413, 'That file is larger than 15 MB.', 'too_large');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!looksLikeXlsx(bytes)) {
    throw new HttpError(
      422,
      'That is not an .xlsx workbook. In Google Sheets use File › Download › Microsoft Excel (.xlsx); in Excel use File › Save As › Excel Workbook.',
      'not_xlsx',
    );
  }

  const previous = (await getTimetableConfig()).mode;
  await saveTimetableConfig({ mode: 'upload' });
  let state;
  try {
    state = await ingestWorkbook('upload', { bytes, fileName: file.name ? file.name.slice(0, 255) : null, modifiedAt: null, via: 'Manual upload' });
  } catch (err) {
    // An unreadable file should not leave the site waiting on an upload that never arrived.
    if (previous !== 'upload') await saveTimetableConfig({ mode: previous });
    if (err instanceof SourceError) throw new HttpError(422, err.message, 'unreadable');
    throw err;
  }
  const parsed = state.status === 'ok' || state.status === 'stale' ? state.data : null;
  return ok({
    diagnostics: await getTimetableDiagnostics(),
    sessions: parsed?.sessions.length ?? 0,
    detected: parsed?.detection.ok ?? false,
    summary: parsed?.detection.summary ?? null,
  });
});
