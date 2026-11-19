import { describe, expect, it } from 'vitest';
import { remindersDue } from '@/lib/placements/reminders';

// 20 Nov 2026, 19:00 IST. IST is UTC+05:30, so 19:00 IST is 13:30 UTC.
const ppt = { date: '2026-11-20', time: '19:00', remindedEveAt: null, remindedHourAt: null };
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe('remindersDue', () => {
  it('sends nothing before 7 pm the evening before', () => {
    expect(remindersDue(ppt, ist('2026-11-19T18:59:00'))).toEqual([]);
  });
  it('sends the evening reminder from 7 pm the day before', () => {
    expect(remindersDue(ppt, ist('2026-11-19T19:10:00'))).toEqual(['eve']);
  });
  it('sends the hour reminder 30 to 90 minutes before the start', () => {
    expect(remindersDue(ppt, ist('2026-11-20T17:40:00'))).toEqual(['hour']);
    const eveDone = { ...ppt, remindedEveAt: ist('2026-11-19T19:05:00') };
    expect(remindersDue(eveDone, ist('2026-11-20T17:29:00'))).toEqual([]);
    expect(remindersDue(eveDone, ist('2026-11-20T18:31:00'))).toEqual([]);
  });
  it('does not repeat a reminder that was already sent', () => {
    const sent = { ...ppt, remindedEveAt: ist('2026-11-19T19:05:00') };
    expect(remindersDue(sent, ist('2026-11-19T19:40:00'))).toEqual([]);
    expect(remindersDue({ ...sent, remindedHourAt: new Date() }, ist('2026-11-20T17:40:00'))).toEqual([]);
  });
  it('sends nothing once the PPT has started', () => {
    expect(remindersDue(ppt, ist('2026-11-20T19:00:00'))).toEqual([]);
    expect(remindersDue(ppt, ist('2026-11-20T20:00:00'))).toEqual([]);
  });
});

describe('remindersDue windows', () => {
  it('opens the evening reminder exactly at 19:00 the day before', () => {
    expect(remindersDue(ppt, ist('2026-11-19T19:00:00'))).toEqual(['eve']);
  });
  it('stops the evening reminder when the hour window opens, and starts the hour one', () => {
    expect(remindersDue(ppt, ist('2026-11-20T17:29:59'))).toEqual([]);
    expect(remindersDue(ppt, ist('2026-11-20T17:30:00'))).toEqual(['hour']);
  });
  it('closes the hour reminder 30 minutes before the start', () => {
    expect(remindersDue(ppt, ist('2026-11-20T18:29:59'))).toEqual(['hour']);
    expect(remindersDue(ppt, ist('2026-11-20T18:30:00'))).toEqual([]);
  });
  it('never says "tomorrow" on the day itself', () => {
    const morning = { ...ppt, time: '10:00' };
    expect(remindersDue(morning, ist('2026-11-20T08:00:00'))).toEqual([]);
    expect(remindersDue(morning, ist('2026-11-20T08:45:00'))).toEqual(['hour']);
    // The evening before still works for a morning PPT.
    expect(remindersDue(morning, ist('2026-11-19T20:00:00'))).toEqual(['eve']);
  });
});
