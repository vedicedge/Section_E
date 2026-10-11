import type { TimetableDiagnostics, TimetableMode } from '@/lib/timetable/service';
import css from './timetable-admin.module.css';

export type Diagnostics = TimetableDiagnostics;
export type Mode = TimetableMode;
export type CachedCopy = NonNullable<Diagnostics['cache']>;
export type Status = { kind: 'ok' | 'error'; text: string } | null;

/** What PUT/POST /api/admin/timetable answer with. */
export interface SaveResult {
  diagnostics: Diagnostics;
  status: string | null;
  error: { code: string; message: string } | null;
}

export interface PanelProps {
  d: Diagnostics;
  /** Clock for relative times: the server's at first render, then the browser's. */
  now: number;
  onSaved: (next: Diagnostics) => void;
}

export const MODE_LABEL: Record<Mode, string> = {
  relay: 'Apps Script relay',
  link: 'Public share link',
  upload: 'Manual upload',
};

/** Which source produced the cached copy. */
export function copyKind(c: CachedCopy): Mode {
  return c.kind;
}

export const isGoogleLink = (url: string | null): url is string => Boolean(url && /^https:\/\/(docs|drive)\.google\.com\//i.test(url.trim()));

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Polite live region that stays mounted, so screen readers announce each new message. */
export function StatusNote({ status }: { status: Status }) {
  return (
    <div className={css.live} aria-live="polite">
      {status && (
        <p className={`notice ${status.kind === 'ok' ? 'notice--ok' : ''}`} role={status.kind === 'error' ? 'alert' : undefined}>
          {status.text}
        </p>
      )}
    </div>
  );
}
