import { describe, expect, it } from 'vitest';
import type { Grid, GridCell } from '../../src/lib/grid';
import { attendeeRolls, parsePlacementEmail, rollsInText } from '../../src/lib/placements/parse';

const GODREJ_SUBJECT = 'Pre-Placement Talk || Finals 2025-27 || SIP 2026-28 || Godrej Properties';
const GODREJ_BODY = `Dear Students,

We are pleased to inform you that *Godrej Properties *will be conducting
its *Pre-Placement Talk* for our institute:

   - *Date:* 20th November 2026
   - *Time: *7:00 PM
   - *Venue: *Auditorium

Kindly adhere to the following rules during the PPT:

   - Dress up in *Business Formals and be well-groomed*
   - Ensure that your queries are respectful of the organization and
   relevant to the session
   - *Keep the session highly interactive as it will be evaluative in
   nature*

*Note: It is mandatory for all the students in the attendee list to attend
the Pre-Placement Talk. Any student failing to attend the Pre-Placement
Talk will not be eligible f**or** the Selection Process. No exemptions will
be entertained under any circumstances.*

*Strictly adhere to the above-mentioned guidelines to avoid severe
repercussions.*

Kindly contact the undersigned in case of any queries.

*Best Regards,*
*Corporate Relations Committee*
`;
const RECEIVED = '2026-11-18T05:39:42Z';

function parse(body: string, subject = 'PPT') {
  return parsePlacementEmail({ subject, body, receivedAt: RECEIVED });
}

describe('parsePlacementEmail', () => {
  it('reads the real Godrej email', () => {
    const r = parsePlacementEmail({ subject: GODREJ_SUBJECT, body: GODREJ_BODY, receivedAt: RECEIVED });
    expect(r).toMatchObject({
      company: 'Godrej Properties',
      title: 'Godrej Properties PPT',
      date: '2026-11-20',
      time: '19:00',
      venue: 'Auditorium',
    });
    expect(r.notes).toContain('Business formals');
    expect(r.notes).toContain('Attendance is mandatory for everyone on the attendee list');
  });

  it('falls back to the "will be conducting" phrase for the company', () => {
    expect(parsePlacementEmail({ subject: 'PPT', body: GODREJ_BODY, receivedAt: RECEIVED }).company).toBe('Godrej Properties');
  });

  it('reads a year-less date from the received year', () => {
    expect(parse('Date: Nov 20').date).toBe('2026-11-20');
  });

  it('reads times', () => {
    expect(parse('Time: 19:00').time).toBe('19:00');
    expect(parse('Time: 10.30 AM').time).toBe('10:30');
    expect(parse('Time: 12:15 AM').time).toBe('00:15');
    expect(parse('Time: 12:00 PM').time).toBe('12:00');
    expect(parse('Time: 9 AM').time).toBe('09:00');
    expect(parse('Time: 7 PM').time).toBe('19:00');
  });

  it('applies the meridiem written after a range to its start too', () => {
    expect(parse('Time: 7:00 - 8:30 PM').time).toBe('19:00');
    expect(parse('Time: 6.30 to 8 pm').time).toBe('18:30');
    expect(parse('Time: 10:30 AM - 12:00 PM').time).toBe('10:30');
    expect(parse('Time: 11:00 - 1:00 PM').time).toBe('11:00');
    expect(parse('Time: 7:00 PM - 8:30 PM').time).toBe('19:00');
  });

  it('gives null for a bare 12-hour time instead of guessing AM', () => {
    expect(parse('Time: 3:00').time).toBeNull();
    expect(parse('Time: 7:30').time).toBeNull();
    expect(parse('Time: 12:00').time).toBeNull();
    expect(parse('Time: 7').time).toBeNull();
  });

  it('accepts a bare time only when it is clearly 24-hour', () => {
    expect(parse('Time: 15:30').time).toBe('15:30');
    expect(parse('Time: 09:00').time).toBe('09:00');
    expect(parse('Time: 19:00 hrs').time).toBe('19:00');
  });

  it('uses the Asia/Kolkata calendar day for year inference', () => {
    const r = parsePlacementEmail({ subject: 'PPT', body: 'Date: Jan 5', receivedAt: '2026-12-31T20:00:00Z' });
    expect(r.date).toBe('2027-01-05');
  });

  it('returns null rather than guessing', () => {
    const r = parse('Dear students, a talk is happening soon.');
    expect(r.venue).toBeNull();
    expect(r.date).toBeNull();
    expect(r.time).toBeNull();
    expect(r.notes).toEqual([]);
  });
});

const cell = (text: string): GridCell => ({ t: 's', v: text, text });
function grid(rows: string[][]): Grid {
  return {
    name: 'Sheet1',
    rows: rows.length,
    cols: 3,
    cells: rows.map((r) => r.map((t) => (t === '' ? null : cell(t)))),
    merges: [],
  };
}

describe('attendeeRolls', () => {
  it('collects unique upper-cased rolls in sheet order', () => {
    const g = grid([
      ['Sr No.', 'Full Name', 'Roll Number'],
      ['1', 'A', '24PGDM144'],
      ['2', 'B', '26PGDM254'],
      ['3', 'C', ' 26pgdm255 '],
      ['4', 'D', '24PGDM144'],
    ]);
    expect(attendeeRolls([g])).toEqual(['24PGDM144', '26PGDM254', '26PGDM255']);
  });

  it('keeps rolls ending in R and ignores names and numbers', () => {
    const g = grid([
      ['Sr No.', 'Full Name', 'Roll Number'],
      ['2', 'Srijita Goswami', '24PGDM046R'],
    ]);
    expect(attendeeRolls([g])).toEqual(['24PGDM046R']);
  });

  it('finds rolls embedded in annotated cells and ignores non-PGDM codes', () => {
    const g = grid([
      ['1', 'A', '24PGDM144 (Ravi)'],
      ['2', 'B', 'Roll: 26pgdm254r'],
      ['3', 'C', '24ABC12'],
      ['4', 'D', '99X1'],
      ['5', 'E', '24MBA5Z'],
    ]);
    expect(attendeeRolls([g])).toEqual(['24PGDM144', '26PGDM254R']);
  });
});

describe('rollsInText', () => {
  it('finds roll numbers in pasted lines and commas, unique and upper-cased', () => {
    expect(rollsInText('26pgdm901, 26PGDM902\n26PGDM901 Asha 24PGDM046R\nnot a roll 12345')).toEqual(['26PGDM901', '26PGDM902', '24PGDM046R']);
    expect(rollsInText('nothing here')).toEqual([]);
  });
});
