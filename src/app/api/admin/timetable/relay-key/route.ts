import { z } from 'zod';
import { HttpError, ok, readJson, requireAdmin, route } from '@/lib/http';
import { relayScript } from '@/lib/timetable/relay-script';
import { getTimetableConfig, getTimetableDiagnostics, rotateRelayKey, saveTimetableConfig } from '@/lib/timetable/service';
import { parseSourceUrl, SourceError, type ParsedSource } from '@/lib/timetable/source';

export const dynamic = 'force-dynamic';

const body = z.object({ url: z.string().trim().max(2000).optional() });

const NOT_GOOGLE =
  'The relay works with Google Sheets and Google Drive files. Open the timetable in your browser and copy the address bar — it starts with https://docs.google.com/ or https://drive.google.com/.';

function siteOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host'))?.split(',')[0]?.trim();
  if (!host) return new URL(req.url).origin;
  const local = /^(localhost|127\.|\[::1\])/.test(host);
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || (local ? 'http' : 'https');
  return `${proto}://${host}`;
}

/**
 * Issues a new relay key (the previous one stops working) and returns the Apps Script with the key
 * baked in. The key is shown only in this response; we keep just its hash. Also switches the site
 * to relay mode, so the script's first run is accepted.
 */
export const POST = route(async (req) => {
  await requireAdmin();
  const { url } = await readJson(req, body);
  const link = url || (await getTimetableConfig()).url;
  if (!link) throw new HttpError(422, 'Paste the Google Sheets link of the timetable first.', 'no_url');

  let source: ParsedSource;
  try {
    source = parseSourceUrl(link);
  } catch (err) {
    throw new HttpError(422, err instanceof SourceError ? `${err.message} ${NOT_GOOGLE}` : NOT_GOOGLE, 'invalid_url');
  }
  if (source.kind !== 'google') throw new HttpError(422, NOT_GOOGLE, 'not_google');

  await saveTimetableConfig({ url: source.original, mode: 'relay' });
  const key = await rotateRelayKey();
  const endpoint = `${siteOrigin(req)}/api/timetable/ingest`;
  return ok({
    key,
    endpoint,
    script: relayScript({ endpoint, relayKey: key, fileId: source.fileId }),
    diagnostics: await getTimetableDiagnostics(),
  });
});
