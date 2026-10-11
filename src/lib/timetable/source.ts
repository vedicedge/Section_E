import 'server-only';
import { looksLikeXlsx } from '../xlsx';

/**
 * Turns a share link into something we can download, and downloads it.
 *
 * Supported sources
 *  - Google Drive / Google Sheets links ("Anyone with the link can view"). With GOOGLE_API_KEY the
 *    Drive API v3 is used, which also returns the file's real modified time. Without a key the
 *    public download endpoints are used and changes are detected by content hash.
 *  - OneDrive / SharePoint "anyone" links (download=1 is appended).
 *  - Any other direct HTTPS link to an .xlsx file.
 */

export type ParsedSource =
  | { kind: 'google'; fileId: string; resourceKey: string | null; original: string }
  | { kind: 'url'; url: string; original: string };

export class SourceError extends Error {
  constructor(
    public code: 'invalid_url' | 'not_public' | 'not_found' | 'not_xlsx' | 'too_large' | 'network' | 'http',
    message: string,
  ) {
    super(message);
  }
}

const MAX_BYTES = 15 * 1024 * 1024;

export function parseSourceUrl(input: string): ParsedSource {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SourceError('invalid_url', 'That does not look like a link.');
  }
  const devLocal = process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !devLocal) throw new SourceError('invalid_url', 'Only https:// links are supported.');

  const host = url.hostname.toLowerCase();
  if (host === 'docs.google.com' || host === 'drive.google.com') {
    const m = /\/d\/([a-zA-Z0-9_-]{10,})/.exec(url.pathname);
    const fileId = m?.[1] ?? url.searchParams.get('id');
    if (!fileId) throw new SourceError('invalid_url', 'Could not find a file id in that Google link.');
    return { kind: 'google', fileId, resourceKey: url.searchParams.get('resourcekey'), original: input.trim() };
  }
  if (host.endsWith('sharepoint.com') || host === '1drv.ms' || host === 'onedrive.live.com') {
    url.searchParams.set('download', '1');
  }
  return { kind: 'url', url: url.toString(), original: input.trim() };
}

export interface DownloadedFile {
  bytes: Uint8Array;
  fileName: string | null;
  /** Authoritative modified time when the source exposes one. */
  modifiedAt: string | null;
  via: string;
}

async function getBytes(url: string, init: RequestInit = {}): Promise<{ res: Response; bytes: Uint8Array }> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
      headers: { 'User-Agent': 'SectionE-Timetable/1.0', ...init.headers },
    });
  } catch (err) {
    throw new SourceError('network', `Could not reach the timetable source (${(err as Error).message}).`);
  }
  const length = Number(res.headers.get('content-length') || 0);
  if (length > MAX_BYTES) throw new SourceError('too_large', 'The timetable file is larger than 15 MB.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new SourceError('too_large', 'The timetable file is larger than 15 MB.');
  return { res, bytes };
}

function fileNameFrom(res: Response): string | null {
  const cd = res.headers.get('content-disposition') ?? '';
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) return decodeURIComponent(star[1]!);
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain?.[1] ?? null;
}

function explainHtml(status: number): SourceError {
  if (status === 404) return new SourceError('not_found', 'The timetable file was not found. Check the link.');
  return new SourceError(
    'not_public',
    'Google returned a sign-in page instead of the file. The sheet must be shared as "Anyone with the link — Viewer".',
  );
}

async function downloadGoogle(src: Extract<ParsedSource, { kind: 'google' }>, apiKey: string | null): Promise<DownloadedFile> {
  const { fileId, resourceKey } = src;
  if (apiKey) {
    const headers: Record<string, string> = resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${fileId}/${resourceKey}` } : {};
    const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`;
    const metaRes = await getBytes(`${base}?fields=id,name,mimeType,modifiedTime&supportsAllDrives=true&key=${encodeURIComponent(apiKey)}`, { headers });
    if (metaRes.res.status === 404) throw new SourceError('not_found', 'Google Drive says the file does not exist or is not shared publicly.');
    if (!metaRes.res.ok) throw new SourceError('http', `Google Drive API error ${metaRes.res.status}.`);
    const meta = JSON.parse(new TextDecoder().decode(metaRes.bytes)) as { name: string; mimeType: string; modifiedTime: string };
    const contentUrl =
      meta.mimeType === 'application/vnd.google-apps.spreadsheet'
        ? `${base}/export?mimeType=${encodeURIComponent('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')}&key=${encodeURIComponent(apiKey)}`
        : `${base}?alt=media&supportsAllDrives=true&key=${encodeURIComponent(apiKey)}`;
    const { res, bytes } = await getBytes(contentUrl, { headers });
    if (!res.ok) throw new SourceError('http', `Google Drive API error ${res.status} while downloading.`);
    if (!looksLikeXlsx(bytes)) throw new SourceError('not_xlsx', 'The Drive file is not an Excel workbook.');
    return { bytes, fileName: meta.name, modifiedAt: meta.modifiedTime, via: 'Google Drive API' };
  }

  // Public endpoints, no key. An uploaded .xlsx downloads from /uc; a native Google Sheet exports from /export.
  const rk = resourceKey ? `&resourcekey=${encodeURIComponent(resourceKey)}` : '';
  const candidates = [
    `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}${rk}`,
    `https://docs.google.com/spreadsheets/d/${encodeURIComponent(fileId)}/export?format=xlsx${rk}`,
  ];
  let lastError: SourceError | null = null;
  for (const url of candidates) {
    try {
      const { res, bytes } = await getBytes(url);
      if (res.ok && looksLikeXlsx(bytes)) {
        const lm = res.headers.get('last-modified');
        return { bytes, fileName: fileNameFrom(res), modifiedAt: lm ? new Date(lm).toISOString() : null, via: 'public link' };
      }
      lastError = res.ok ? explainHtml(res.status) : res.status === 404 ? explainHtml(404) : explainHtml(res.status);
    } catch (err) {
      lastError = err instanceof SourceError ? err : new SourceError('network', String(err));
    }
  }
  throw lastError ?? new SourceError('network', 'Could not download the timetable.');
}

export async function downloadSource(src: ParsedSource, apiKey: string | null): Promise<DownloadedFile> {
  if (src.kind === 'google') return downloadGoogle(src, apiKey);
  const { res, bytes } = await getBytes(src.url);
  if (!res.ok) throw new SourceError(res.status === 404 ? 'not_found' : 'http', `The timetable link answered with HTTP ${res.status}.`);
  if (!looksLikeXlsx(bytes)) throw new SourceError('not_xlsx', 'The link did not return an Excel (.xlsx) file. Use a direct download link.');
  const lm = res.headers.get('last-modified');
  return { bytes, fileName: fileNameFrom(res), modifiedAt: lm ? new Date(lm).toISOString() : null, via: 'direct link' };
}

/** Short, non-sensitive label for the UI ("Google Drive file …TEha"). */
export function describeSource(src: ParsedSource): string {
  if (src.kind === 'google') return `Google Drive file …${src.fileId.slice(-4)}`;
  try {
    return new URL(src.url).hostname;
  } catch {
    return 'custom link';
  }
}
