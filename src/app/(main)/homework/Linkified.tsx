import type { ReactNode } from 'react';

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const TRAILING = '.,;:!?\'"]}>»”’';

/** Drops sentence punctuation stuck to the end of a URL, keeping balanced ")" as in Wikipedia links. */
function trimUrl(raw: string): string {
  let url = raw;
  while (url.length) {
    const ch = url[url.length - 1]!;
    if (ch === ')') {
      const open = url.split('(').length - 1;
      const close = url.split(')').length - 1;
      if (close <= open) break;
    } else if (!TRAILING.includes(ch)) {
      break;
    }
    url = url.slice(0, -1);
  }
  return url;
}

function safeHref(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

function shortLabel(url: string): string {
  const bare = url.replace(/^https?:\/\/(www\.)?/i, '');
  return bare.length > 56 ? `${bare.slice(0, 54)}…` : bare;
}

/** Plain text with http(s) links made clickable. Rendered by React, so nothing is ever parsed as HTML. */
export function Linkified({ text, className }: { text: string; className?: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    const url = trimUrl(match[0]);
    const href = safeHref(url);
    if (!href) continue;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <a key={start} href={href} target="_blank" rel="noopener noreferrer" className={className} title={url}>
        {shortLabel(url)}
        <span aria-hidden> ↗</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>,
    );
    last = start + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}
