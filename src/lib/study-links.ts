/** What a study-material link points at, worked out from the URL alone (no network calls). */

export type StudyKind = 'video' | 'doc';

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character YouTube video id in a watch, short, embed, shorts or live link; null otherwise. */
export function youtubeId(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = url.pathname.split('/')[1] ?? null;
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else id = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(url.pathname)?.[1] ?? null;
  }
  return id && YT_ID.test(id) ? id : null;
}

export function studyKind(url: string): StudyKind {
  return youtubeId(url) ? 'video' : 'doc';
}

/** Where the link goes, in a word or two: "YouTube", "Google Drive", or the site's name. */
export function studySource(input: string): string {
  if (youtubeId(input)) return 'YouTube';
  try {
    const host = new URL(input).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'drive.google.com') return 'Google Drive';
    if (host === 'docs.google.com') return 'Google Docs';
    return host;
  } catch {
    return 'Link';
  }
}
