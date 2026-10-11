import { subjectKey } from '../names';

/** Title comparison ignores "and"/"&" so "Team & Organizational Dynamics" matches. */
function titleKey(text: string): string {
  return subjectKey(text.replace(/\band\b|&/gi, ' '));
}

export interface SubjectRef {
  code: string;
  title: string;
  aliases: string[];
}

/**
 * Finds which subject a timetable cell refers to by code ("SM", "MM-II"), full title
 * ("Strategic Management") or an admin-defined alias. Longest match wins.
 */
export function matchSubject<T extends SubjectRef>(text: string, subjects: T[]): T | null {
  const tokens = text.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  const windows = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i; j < Math.min(tokens.length, i + 5); j++) windows.add(subjectKey(tokens.slice(i, j + 1).join(' ')));
  }
  const whole = titleKey(text);

  let best: { subject: T; score: number } | null = null;
  for (const subject of subjects) {
    const candidates = [subject.code, ...subject.aliases].map(subjectKey).filter(Boolean);
    for (const key of candidates) {
      if (windows.has(key) && (!best || key.length > best.score)) best = { subject, score: key.length };
    }
    const key = titleKey(subject.title);
    if (key.length >= 6 && whole.includes(key) && (!best || key.length > best.score)) {
      best = { subject, score: key.length };
    }
  }
  return best?.subject ?? null;
}
