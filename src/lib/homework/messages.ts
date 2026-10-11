import { addDays, formatClock, formatDay } from '../time';
import type { ResolvedDue } from './due';

/** Plain-text wording shared by the site, push notifications and the WhatsApp share. */

export interface MessageItem {
  subjectCode: string;
  subjectTitle: string;
  title: string;
  dueMode: 'next_class' | 'date';
  due: ResolvedDue;
}

/** "tomorrow", "today", "Thu, 16 Oct", "next class (date to be confirmed)". */
export function dueLabel(due: ResolvedDue, today: string, opts: { withTime?: boolean } = {}): string {
  if (!due.date) return 'next class (date to be confirmed)';
  const time = opts.withTime && due.time ? `, ${formatClock(due.time)}` : '';
  if (due.date === today) return `today${time}`;
  if (due.date === addDays(today, 1)) return `tomorrow${time}`;
  return `${formatDay(due.date)}${time}`;
}

/** Full sentence for cards: "Due next class · Tue, 14 Oct, 9:00 am" / "Due Fri, 17 Oct". */
export function dueSentence(item: Pick<MessageItem, 'dueMode' | 'due'>, today: string): string {
  const when = dueLabel(item.due, today, { withTime: true });
  if (item.dueMode === 'next_class') return item.due.date ? `Due next class · ${when}` : 'Due next class (date to be confirmed)';
  return `Due ${when}`;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** The evening-before reminder for one student (only the items they haven't ticked off). */
export function reminderPayload(items: MessageItem[], date: string): PushPayload {
  const n = items.length;
  const lines = items.map((i) => `${i.subjectCode}: ${clip(i.title, 60)}`);
  return {
    title: `Due tomorrow · ${n} task${n === 1 ? '' : 's'}`,
    body: clip(lines.join(' · '), 180),
    url: '/homework',
    tag: `homework-due-${date}`,
  };
}

/** Sent when the admin posts homework with "notify now". */
export function newHomeworkPayload(items: MessageItem[], today: string): PushPayload {
  if (items.length === 1) {
    const i = items[0]!;
    return {
      title: `New homework · ${i.subjectCode}`,
      body: clip(`${i.title} — due ${dueLabel(i.due, today)}`, 180),
      url: '/homework',
      tag: `homework-new-${i.subjectCode}`,
    };
  }
  return {
    title: `${items.length} new homework tasks`,
    body: clip(items.map((i) => `${i.subjectCode}: ${clip(i.title, 40)}`).join(' · '), 180),
    url: '/homework',
    tag: 'homework-new',
  };
}

/** Ready-to-paste message for the class WhatsApp group. */
export function whatsappText(items: MessageItem[], date: string, today: string, siteUrl: string | null): string {
  const heading = date === addDays(today, 1) ? `Homework due tomorrow (${formatDay(date)})` : `Homework due ${formatDay(date)}`;
  const lines = items.map((i) => {
    const time = i.due.time ? ` — ${i.dueMode === 'next_class' ? 'class at ' : ''}${formatClock(i.due.time)}` : '';
    return `• *${i.subjectCode}* ${i.title.replace(/\s+/g, ' ').trim()}${time}`;
  });
  return [`📚 Section E · ${heading}`, '', ...lines, ...(siteUrl ? ['', `Tick it off: ${siteUrl.replace(/\/$/, '')}/homework`] : [])].join('\n');
}
