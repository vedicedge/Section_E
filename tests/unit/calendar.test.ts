import { describe, expect, it } from 'vitest';
import { buildCalendar, escapeText, foldLine, icsTime, zonedToUtc } from '@/lib/calendar/ics';

describe('calendar feed', () => {
  it('converts the college clock to UTC', () => {
    expect(icsTime(zonedToUtc('2026-11-02', '10:45', 'Asia/Kolkata'))).toBe('20261102T051500Z');
    expect(icsTime(zonedToUtc('2026-11-02', '00:15', 'Asia/Kolkata'))).toBe('20261101T184500Z');
    expect(icsTime(zonedToUtc('2026-07-01', '09:00', 'Europe/London'))).toBe('20260701T080000Z');
  });

  it('escapes text and folds long lines without splitting characters', () => {
    expect(escapeText('Row 5, Seat 12; back\\wall\nColosseum')).toBe('Row 5\\, Seat 12\\; back\\\\wall\\nColosseum');
    const long = 'DESCRIPTION:' + 'Ünïcode seat · '.repeat(12);
    const folded = foldLine(long);
    for (const line of folded.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(long);
  });

  it('writes events with the seat as the location', () => {
    const ics = buildCalendar({
      name: 'Section E classes',
      tz: 'Asia/Kolkata',
      now: new Date('2026-11-02T00:00:00Z'),
      events: [
        { uid: 'a@section-e', date: '2026-11-02', start: '10:45', end: '12:15', summary: 'OM', location: 'Row 5, Seat 12 · Colosseum', description: 'With Prof. A Rao', cancelled: false },
        { uid: 'b@section-e', date: '2026-11-03', start: '09:00', end: '10:30', summary: 'Cancelled: CF', location: null, description: null, cancelled: true },
      ],
    });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261102T051500Z\r\nDTEND:20261102T064500Z\r\nSUMMARY:OM\r\nLOCATION:Row 5\\, Seat 12 · Colosseum');
    expect(ics).toContain('STATUS:CANCELLED');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
