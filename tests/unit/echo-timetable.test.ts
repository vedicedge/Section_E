import { describe, expect, it } from 'vitest';
import { timetableForEcho } from '@/lib/echo-timetable';

const base = { start: '09:00', end: '10:15', faculty: 'Prof. A', room: 'LH-4', status: 'scheduled' as const };

describe('class timetable for Echo', () => {
  it('keeps when, what, who and where, with the weekday spelled out', () => {
    const [day] = timetableForEcho([
      { date: '2026-11-17', sessions: [{ ...base, text: 'CF S10 Prof. A LH-4', subject: 'CF', planCode: 'CF', planTitle: 'Corporate Finance' }] },
    ]);
    expect(day).toMatchObject({ date: '2026-11-17', weekday: 'Tue' });
    expect(day.sessions[0]).toEqual({
      start: '09:00',
      end: '10:15',
      subject: 'Corporate Finance',
      code: 'CF',
      faculty: 'Prof. A',
      room: 'LH-4',
      status: 'scheduled',
    });
  });

  it('falls back to the sheet text, tidied and shortened, when no seating plan matches', () => {
    const long = 'Guest   lecture\n' + 'x'.repeat(300);
    const [day] = timetableForEcho([{ date: '2026-11-18', sessions: [{ ...base, text: long, subject: null, planCode: null, planTitle: null }] }]);
    expect(day.sessions[0].code).toBeNull();
    expect(day.sessions[0].subject.startsWith('Guest lecture x')).toBe(true);
    expect(day.sessions[0].subject.length).toBeLessThanOrEqual(120);
  });

  it('carries cancelled, rescheduled and exam status through', () => {
    const [day] = timetableForEcho([
      {
        date: '2026-11-19',
        sessions: [
          { ...base, status: 'cancelled', text: 'OM', subject: 'OM', planCode: 'OM', planTitle: 'Operations Management' },
          { ...base, status: 'exam', text: 'DMA quiz', subject: 'DMA', planCode: null, planTitle: null },
        ],
      },
    ]);
    expect(day.sessions.map((s) => s.status)).toEqual(['cancelled', 'exam']);
  });

  it('is empty when there are no classes', () => {
    expect(timetableForEcho([])).toEqual([]);
  });
});
