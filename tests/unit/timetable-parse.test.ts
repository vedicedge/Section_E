import { describe, expect, it } from 'vitest';
import { describeCell, parseDateText, parseTimeRange, parseTimetable, sectionPart } from '@/lib/timetable/parse';
import { grid } from './helpers';

const TODAY = '2026-10-11';

describe('parseTimeRange', () => {
  it('reads common slot formats', () => {
    expect(parseTimeRange('9:00 - 10:15')).toEqual({ start: '09:00', end: '10:15' });
    expect(parseTimeRange('09.00 AM to 10.30 AM')).toEqual({ start: '09:00', end: '10:30' });
    expect(parseTimeRange('2:15–3:30')).toEqual({ start: '14:15', end: '15:30' });
    expect(parseTimeRange('11:45 am - 1:00 pm')).toEqual({ start: '11:45', end: '13:00' });
    expect(parseTimeRange('Session I (9:30-10:45)')).toEqual({ start: '09:30', end: '10:45' });
  });
  it('does not mistake dates for times', () => {
    expect(parseTimeRange('12-10-2026')).toBeNull();
    expect(parseTimeRange('Sec E')).toBeNull();
  });
});

describe('parseDateText', () => {
  it('reads day-first and named-month dates', () => {
    expect(parseDateText('12/10/2026', TODAY)).toBe('2026-10-12');
    expect(parseDateText('12-Oct-26', TODAY)).toBe('2026-10-12');
    expect(parseDateText('Monday, 12th October', TODAY)).toBe('2026-10-12');
    expect(parseDateText('Oct 12, 2026', TODAY)).toBe('2026-10-12');
    expect(parseDateText('Strategic Management', TODAY)).toBeNull();
  });
});

describe('cell helpers', () => {
  it('splits subject, faculty and room', () => {
    expect(describeCell('Corporate Finance\nProf. Neha Rao\nRoom 204')).toEqual({
      subject: 'Corporate Finance',
      faculty: 'Prof. Neha Rao',
      room: 'Room 204',
    });
    expect(describeCell('SM (RKS)')).toEqual({ subject: 'SM', faculty: 'RKS', room: null });
  });
  it('keeps only our section from a shared cell', () => {
    expect(sectionPart('SM - Sec E / CF - Sec F', 'E')).toBe('SM - Sec E');
    expect(sectionPart('CF - Sec F', 'E')).toBeNull();
    expect(sectionPart('Guest lecture', 'E')).toBe('Guest lecture');
    expect(sectionPart('Sec D & E: Guest lecture', 'E')).toBe('Sec D & E: Guest lecture');
  });
});

describe('parseTimetable', () => {
  it('reads a venue-per-section sheet: booking notes with times, rooms lent out and borrowed', () => {
    // The layout of the official sheet: a Session row, a time row, then five rows per day,
    // one per section and its home room. Names are invented.
    const g = grid('master', [
      ['College'],
      ['Date', 'Days', 'Sec', 'Venue', 'Session - 1', 'Session - 2', 'Session - 3', 'Lunch Break', 'Session - 4', 'Extra Session'],
      ['', '', '', '', '9:00 - 10:30', '10:45 - 12:15', '12:30 - 2:00', '2:00 - 3:00 p.m.', '3:00 - 4:30', '4.45-6.15'],
      ['@date:2026-10-28', 'Wednesday', 'A', 'Nestle', 'MM II\n(Prof. A Rao)', '', '', 'CF Quiz 1\n2.05-2.15', 'Booked for PGDM HRM\n2.30-4.00', ''],
      ['', '', 'B', 'ITC', 'Booked for DT Sec E', '', '', 'CF Quiz 1\n2.05-2.15', 'CF\n(Prof. B Sen)', ''],
      ['', '', 'E', 'Colosseum', '', 'TOD\n(Prof. C Iyer)', 'Booked for SM Sec B', 'CF Quiz 1\n2.05-2.15', 'Students booked for a talk\n4.00-5.30', ''],
      ['@date:2026-10-29', 'Thursday', 'A', 'Nestle', '', 'Booked for PGDM II\n4.00-6.00 p.m.', 'Booked for Quiz\n1.30-2.30', '', '', ''],
      ['', '', 'B', 'ITC', 'Booked for OM Sec E', '', '', '', '', ''],
      ['', '', 'E', 'Colosseum', 'OM\n(Prof. D Das)\nVenue: Lab 1', 'OM\n(Prof. D Das)', 'CF\n(Prof. B Sen)', '', 'SM\n(Prof. E Paul)', ''],
    ]);
    g.merges.push({ r1: 3, c1: 0, r2: 5, c2: 0 }, { r1: 6, c1: 0, r2: 8, c2: 0 });
    const res = parseTimetable([g], { section: 'E', today: TODAY });
    expect(res.detection.ok).toBe(true);
    expect(res.sessions.map((s) => [s.date, s.start, s.end, s.subject, s.room])).toEqual([
      // DT borrows Section B's room; SM Sec B borrowing ours is not our class.
      ['2026-10-28', '09:00', '10:30', 'DT', 'ITC'],
      ['2026-10-28', '10:45', '12:15', 'TOD', 'Colosseum'],
      ['2026-10-28', '14:05', '14:15', 'CF Quiz 1', 'Colosseum'],
      // A cell's own time wins over its column's.
      ['2026-10-28', '16:00', '17:30', 'Students booked for a talk', 'Colosseum'],
      // Morning classes after rows of timed notes are still read; our own row wins over a booking elsewhere.
      ['2026-10-29', '09:00', '10:30', 'OM', 'Lab 1'],
      ['2026-10-29', '10:45', '12:15', 'OM', 'Colosseum'],
      ['2026-10-29', '12:30', '14:00', 'CF', 'Colosseum'],
      ['2026-10-29', '15:00', '16:30', 'SM', 'Colosseum'],
    ]);
  });

  it('slots across the top + a Section column', () => {
    const g = grid('Week 3', [
      ['PGDM 2026-28 — Term II Timetable'],
      ['Date', 'Day', 'Section', '9:00 - 10:15', '10:30 - 11:45', '12:00 - 1:15', '2:15 - 3:30'],
      ['@date:2026-10-12', 'Monday', 'D', 'CF', 'SM', 'OM', ''],
      ['', '', 'E', 'SM (RKS) R-101', 'CF', '@strike:OM', 'DAM'],
      ['', '', 'F', 'DAM', 'TOD', '', ''],
      ['@date:2026-10-13', 'Tuesday', 'E', 'MM II', '', 'Lunch', 'DT - Rescheduled to Fri'],
    ]);
    // Date/day merged down across the section rows.
    g.merges.push({ r1: 2, c1: 0, r2: 4, c2: 0 }, { r1: 2, c1: 1, r2: 4, c2: 1 });
    const res = parseTimetable([g], { section: 'E', today: TODAY });
    expect(res.detection.ok).toBe(true);
    expect(res.detection.sectionMode).toBe('column');
    expect(res.sessions.map((s) => [s.date, s.start, s.text, s.status])).toEqual([
      ['2026-10-12', '09:00', 'SM (RKS) R-101', 'scheduled'],
      ['2026-10-12', '10:30', 'CF', 'scheduled'],
      ['2026-10-12', '12:00', 'OM', 'cancelled'],
      ['2026-10-12', '14:15', 'DAM', 'scheduled'],
      ['2026-10-13', '09:00', 'MM II', 'scheduled'],
      ['2026-10-13', '14:15', 'DT - Rescheduled to Fri', 'rescheduled'],
    ]);
    expect(res.sessions[0]).toMatchObject({ subject: 'SM', faculty: 'RKS', room: 'R-101', day: 'Mon', end: '10:15' });
  });

  it('weekdays across the top, times down the side, one sheet per section', () => {
    const e = grid('Sec E', [
      ['Time', 'Monday', 'Tuesday', 'Wednesday'],
      ['09:00-10:15', 'CF\nProf. A Rao', 'SM', ''],
      ['10:30-11:45', 'OM', '', 'TOD'],
    ]);
    const f = grid('Sec F', [
      ['Time', 'Monday'],
      ['09:00-10:15', 'Should not appear'],
    ]);
    const res = parseTimetable([f, e], { section: 'E', today: TODAY });
    expect(res.detection.ok).toBe(true);
    expect(res.detection.sheets).toEqual(['Sec E']);
    expect(res.sessions.map((s) => [s.day, s.start, s.subject])).toEqual([
      ['Mon', '09:00', 'CF'],
      ['Mon', '10:30', 'OM'],
      ['Tue', '09:00', 'SM'],
      ['Wed', '10:30', 'TOD'],
    ]);
    expect(res.sessions[0]!.faculty).toBe('Prof. A Rao');
  });

  it('sections across the top, times down, dates in a side column', () => {
    const g = grid('Oct', [
      ['Date', 'Time', 'Sec A', 'Sec B', 'Sec E'],
      ['14/10/2026', '9:30-10:45', 'CF', 'SM', 'DAM'],
      ['', '11:00-12:15', 'SM', 'CF', 'OM'],
      ['15/10/2026', '9:30-10:45', 'OM', 'OM', 'Mid Term – CF'],
    ]);
    const res = parseTimetable([g], { section: 'E', today: TODAY });
    expect(res.detection.sectionMode).toBe('header');
    expect(res.sessions.map((s) => [s.date, s.start, s.text, s.status])).toEqual([
      ['2026-10-14', '09:30', 'DAM', 'scheduled'],
      ['2026-10-14', '11:00', 'OM', 'scheduled'],
      ['2026-10-15', '09:30', 'Mid Term – CF', 'exam'],
    ]);
  });

  it('refuses to guess when sections are mixed in an unknown way', () => {
    const g = grid('All', [
      ['Day', '9:00-10:00', '10:00-11:00'],
      ['Monday', 'Section A and Section B combined', 'CF'],
    ]);
    const res = parseTimetable([g], { section: 'E', today: TODAY });
    expect(res.detection.ok).toBe(false);
    expect(res.sheets).toHaveLength(1);
  });

  it('falls back when there is no time grid at all', () => {
    const res = parseTimetable([grid('Notes', [['Hello'], ['World']])], { section: 'E', today: TODAY });
    expect(res.detection.ok).toBe(false);
    expect(res.sessions).toEqual([]);
  });
});
