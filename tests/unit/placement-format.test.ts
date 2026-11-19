import { describe, expect, it } from 'vitest';
import { pptClock, pptDay, pptSummary } from '../../src/lib/placements/format';

describe('placement formatting', () => {
  it('formats the day and clock', () => {
    expect(pptDay('2026-11-20')).toBe('Fri 20 Nov');
    expect(pptClock('19:00')).toBe('7:00 PM');
    expect(pptClock('00:05')).toBe('12:05 AM');
    expect(pptClock('12:30')).toBe('12:30 PM');
  });
  it('builds the notification body', () => {
    expect(pptSummary({ title: 'Godrej Properties PPT', date: '2026-11-20', time: '19:00', venue: 'Auditorium' })).toBe(
      'Godrej Properties PPT · Fri 20 Nov, 7:00 PM · Auditorium',
    );
    expect(pptSummary({ title: 'X PPT', date: '2026-11-20', time: '09:00', venue: '' })).toBe('X PPT · Fri 20 Nov, 9:00 AM');
  });
});
