import { describe, expect, it } from 'vitest';
import { bucketOf, compareDue, isClassHappening, nextClassOf, resolveDue, type DueContext } from '@/lib/homework/due';
import { dueSentence, newHomeworkPayload, reminderPayload, whatsappText } from '@/lib/homework/messages';
import type { Session } from '@/lib/timetable/parse';

function s(partial: Partial<Session> & { text: string }): Session {
  return {
    id: `${partial.date ?? partial.day}-${partial.start}-${partial.text}`,
    key: `${partial.date ?? partial.day}|${partial.start}`,
    date: null,
    day: null,
    start: '09:00',
    end: '10:15',
    slotLabel: '',
    subject: null,
    faculty: null,
    room: null,
    status: 'scheduled',
    sheet: 'S',
    cell: 'A1',
    ...partial,
  };
}

const subjectOf = (x: Session) => x.text.split(/[\s-]/)[0] ?? null;

describe('nextClassOf — dated timetable', () => {
  const ctx: DueContext = {
    subjectOf,
    sessions: [
      s({ date: '2026-10-12', day: 'Mon', start: '09:00', text: 'CF' }),
      s({ date: '2026-10-13', day: 'Tue', start: '14:15', text: 'CF - Rescheduled to Friday', status: 'rescheduled' }),
      s({ date: '2026-10-14', day: 'Wed', start: '10:30', text: 'SM' }),
      s({ date: '2026-10-15', day: 'Thu', start: '12:00', text: 'CF', status: 'cancelled' }),
      s({ date: '2026-10-16', day: 'Fri', start: '11:00', text: 'CF' }),
      s({ date: '2026-10-16', day: 'Fri', start: '09:00', text: 'CF' }),
    ],
  };
  it('skips cancelled classes and classes moved elsewhere, and picks the earliest slot', () => {
    expect(nextClassOf('CF', '2026-10-12', ctx)).toEqual({ date: '2026-10-16', time: '09:00' });
  });
  it('is strictly after the day the homework was given', () => {
    expect(nextClassOf('CF', '2026-10-11', ctx)).toEqual({ date: '2026-10-12', time: '09:00' });
    expect(nextClassOf('SM', '2026-10-14', ctx)).toBeNull();
  });
});

describe('nextClassOf — weekly timetable', () => {
  const ctx: DueContext = {
    subjectOf,
    sessions: [s({ day: 'Tue', start: '10:30', text: 'OM' }), s({ day: 'Fri', start: '09:00', text: 'OM' })],
  };
  it('projects weekdays forward', () => {
    expect(nextClassOf('OM', '2026-10-13', ctx)).toEqual({ date: '2026-10-16', time: '09:00' }); // Tue → Fri
    expect(nextClassOf('OM', '2026-10-16', ctx)).toEqual({ date: '2026-10-20', time: '10:30' }); // Fri → next Tue
  });
});

describe('resolveDue', () => {
  const ctx: DueContext = { subjectOf, sessions: [s({ date: '2026-10-14', day: 'Wed', start: '10:30', text: 'SM' })] };
  it('uses fixed dates as given', () => {
    expect(resolveDue({ dueMode: 'date', givenOn: '2026-10-12', dueDate: '2026-10-20', dueTime: null, subjectCode: 'SM' }, ctx)).toEqual({
      date: '2026-10-20',
      time: null,
      source: 'fixed',
    });
  });
  it('follows the timetable for next-class homework, then falls back to the snapshot', () => {
    const spec = { dueMode: 'next_class' as const, givenOn: '2026-10-12', dueDate: '2026-10-13', dueTime: '09:00', subjectCode: 'SM' };
    expect(resolveDue(spec, ctx)).toEqual({ date: '2026-10-14', time: '10:30', source: 'timetable' });
    expect(resolveDue(spec, null)).toEqual({ date: '2026-10-13', time: '09:00', source: 'snapshot' });
    expect(resolveDue({ ...spec, dueDate: null, dueTime: null }, null)).toEqual({ date: null, time: null, source: 'unknown' });
  });
  it('matches subject codes loosely ("MM-II" = "MM II")', () => {
    const c: DueContext = { subjectOf: () => 'MM-II', sessions: [s({ date: '2026-10-15', text: 'MM-II' })] };
    expect(nextClassOf('MM II', '2026-10-12', c)?.date).toBe('2026-10-15');
  });
});

describe('buckets and ordering', () => {
  const today = '2026-10-12';
  it('buckets by due date', () => {
    expect(bucketOf({ date: '2026-10-11', time: null, source: 'fixed' }, today)).toBe('past');
    expect(bucketOf({ date: '2026-10-12', time: null, source: 'fixed' }, today)).toBe('today');
    expect(bucketOf({ date: '2026-10-13', time: null, source: 'fixed' }, today)).toBe('tomorrow');
    expect(bucketOf({ date: '2026-10-20', time: null, source: 'fixed' }, today)).toBe('upcoming');
    expect(bucketOf({ date: null, time: null, source: 'unknown' }, today)).toBe('undated');
  });
  it('orders by date, time, subject; undated last', () => {
    const items = [
      { subjectCode: 'SM', due: { date: null, time: null, source: 'unknown' as const } },
      { subjectCode: 'OM', due: { date: '2026-10-13', time: '11:00', source: 'fixed' as const } },
      { subjectCode: 'CF', due: { date: '2026-10-13', time: '09:00', source: 'fixed' as const } },
    ];
    expect(items.sort(compareDue).map((i) => i.subjectCode)).toEqual(['CF', 'OM', 'SM']);
  });
  it('treats "moved to" cells as not happening', () => {
    expect(isClassHappening(s({ text: 'CF - postponed' }))).toBe(false);
    expect(isClassHappening(s({ text: 'CF (rescheduled from Tue)', status: 'rescheduled' }))).toBe(true);
  });
});

describe('messages', () => {
  const today = '2026-10-12';
  const item = {
    subjectCode: 'CF',
    subjectTitle: 'Corporate Finance',
    title: 'Read chapter 4 and solve Q1–5',
    dueMode: 'next_class' as const,
    due: { date: '2026-10-13', time: '09:00', source: 'timetable' as const },
  };
  it('words due dates naturally', () => {
    expect(dueSentence(item, today)).toBe('Due next class · tomorrow, 9:00 am');
    expect(dueSentence({ ...item, dueMode: 'date', due: { date: '2026-10-16', time: null, source: 'fixed' } }, today)).toBe('Due Fri, 16 Oct');
    expect(dueSentence({ ...item, due: { date: null, time: null, source: 'unknown' } }, today)).toBe('Due next class (date to be confirmed)');
  });
  it('builds push payloads', () => {
    expect(reminderPayload([item, { ...item, subjectCode: 'SM', title: 'Case prep' }], '2026-10-13')).toMatchObject({
      title: 'Due tomorrow · 2 tasks',
      body: 'CF: Read chapter 4 and solve Q1–5 · SM: Case prep',
      url: '/homework',
    });
    expect(newHomeworkPayload([item], today).title).toBe('New homework · CF');
  });
  it('builds the WhatsApp message', () => {
    const text = whatsappText([item], '2026-10-13', today, 'https://example.app/');
    expect(text).toContain('Homework due tomorrow (Tue, 13 Oct)');
    expect(text).toContain('• *CF* Read chapter 4 and solve Q1–5 — class at 9:00 am');
    expect(text).toContain('https://example.app/homework');
  });
});
