import { describe, expect, it } from 'vitest';
import { cleanSubject, findDate, guessSubject, suggestFromEmail } from '@/lib/homework/email';
import { inboxScript } from '@/lib/homework/inbox-script';
import type { Session } from '@/lib/timetable/parse';

const ON = '2026-11-04'; // a Wednesday

describe('findDate', () => {
  it.each([
    ['Deadline for project details: 20 November', '2026-11-20'],
    ["Deadline: 11th December'2026", '2026-12-11'],
    ['Submit by 5th Dec, 2026', '2026-12-05'],
    ['due on December 11, 2026', '2026-12-11'],
    ['due Nov 20th', '2026-11-20'],
    ['last date 15/11', '2026-11-15'],
    ['last date 15/11/26', '2026-11-15'],
    ['submit by 15.11.2026', '2026-11-15'],
    ['submit by Friday', '2026-11-06'],
    ['submit by Wednesday', '2026-11-11'],
    ['submit by tomorrow', '2026-11-05'],
    ['upload your file today', '2026-11-04'],
  ])('%s → %s', (text, expected) => {
    expect(findDate(text, ON)).toBe(expected);
  });

  it('reads a January date in a December email as next year', () => {
    expect(findDate('due 10 January', '2026-12-20')).toBe('2027-01-10');
  });

  it('ignores clock times and impossible dates', () => {
    expect(findDate('class at 10.30 in room 4', ON)).toBeNull();
    expect(findDate('due 31 November', ON)).toBeNull();
  });

  it('takes the first date written', () => {
    expect(findDate('submit by 20 Nov; presentations on 27 Nov', ON)).toBe('2026-11-20');
  });
});

describe('suggestFromEmail', () => {
  it('picks the deadline out of a faculty note', () => {
    const s = suggestFromEmail({
      subject: 'Project-Topics',
      body: 'Dear students,\nYou may take ideas from this file for finalising your project titles. In the 8th session you have to present your work, so plan it accordingly. Deadline for project details: 20 November\nRegards',
      receivedOn: ON,
    });
    expect(s).toMatchObject({ title: 'Project-Topics', dueMode: 'date', dueDate: '2026-11-20' });
    expect(s!.excerpt).toContain('Deadline for project details: 20 November');
  });

  it('handles an apostrophe year and a Re:/Fwd: subject', () => {
    const s = suggestFromEmail({ subject: 'Fwd: Re: Interview protocols', body: "PFA the protocol for both topics.\nDeadline: 11th December'2026\nAll the best", receivedOn: ON });
    expect(s).toMatchObject({ title: 'Interview protocols', dueDate: '2026-12-11', dueMode: 'date' });
  });

  it('turns "before the next class" into a next-class deadline', () => {
    const s = suggestFromEmail({ subject: 'Case: Air Asia', body: 'Read the case and submit your answers before the next class.', receivedOn: ON });
    expect(s).toMatchObject({ dueMode: 'next_class', dueDate: null });
  });

  it('keeps a submission with no date for the admin to fill in', () => {
    const s = suggestFromEmail({ subject: 'Assignment 2', body: 'Please submit the assignment on the LMS.', receivedOn: ON });
    expect(s).toMatchObject({ dueMode: null, dueDate: null, title: 'Assignment 2' });
  });

  it('returns null for slides, readings and "due to"', () => {
    expect(suggestFromEmail({ subject: 'Session 7 resource material', body: 'PFA the resource materials for Session 7.', receivedOn: ON })).toBeNull();
    expect(suggestFromEmail({ subject: 'Class moved', body: 'Due to the guest lecture, class moves to 3 pm.', receivedOn: ON })).toBeNull();
  });

  it('ignores deadlines in the quoted part of a reply', () => {
    const s = suggestFromEmail({
      subject: 'Re: SM 2026',
      body: 'Attaching the ppt of last class.\n\nOn Fri, Oct 23, 2026 at 6:41 PM GK wrote:\n> Submit the case by 25 October',
      receivedOn: ON,
    });
    expect(s).toBeNull();
  });

  it('drops a date that is already past', () => {
    const s = suggestFromEmail({ subject: 'Reminder', body: 'The deadline was 1/11/2026, please submit now.', receivedOn: ON });
    expect(s?.dueDate).toBeNull();
  });
});

describe('inboxScript', () => {
  const script = inboxScript({
    endpoint: 'https://section-e.example/api/homework/inbox',
    inboxKey: 'hw_abc"\'`${x}__ENDPOINT__',
    sectionList: 'pgdm2026sec-e@imi.edu',
    facultyDomain: 'imi.edu',
  });

  it('is valid JavaScript with every value safely quoted', () => {
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain(`const INBOX_KEY = ${JSON.stringify('hw_abc"\'`${x}__ENDPOINT__')};`);
    expect(script).toContain('const ENDPOINT = "https://section-e.example/api/homework/inbox";');
    expect(script).not.toMatch(/__(ENDPOINT|INBOX_KEY|SECTION_LIST|FACULTY_DOMAIN)__;/);
  });

  it('parses a Gmail "From" header', () => {
    const re = /const parts = (\/.*\/)\.exec\(raw\);/.exec(script)![1]!;
    const from = new Function(`return ${re}`)() as RegExp;
    expect(from.exec('"Priya Chaudhary" <priya.chaudhary@imi.edu>')?.slice(1)).toEqual(['Priya Chaudhary', 'priya.chaudhary@imi.edu']);
    expect(from.exec('Ruchika . <ruchika@imi.edu>')?.slice(1)).toEqual(['Ruchika .', 'ruchika@imi.edu']);
  });
});

describe('cleanSubject', () => {
  it('strips reply and forward prefixes', () => {
    expect(cleanSubject('RE: Fwd:  BRM  outline')).toBe('BRM outline');
  });
});

describe('guessSubject', () => {
  const subjects = [
    { code: 'TOD', title: 'Team and Organizational Dynamics' },
    { code: 'OM', title: 'Operations Management' },
    { code: 'CF', title: 'Corporate Finance' },
  ];
  const session = (text: string, faculty: string | null): Session => ({
    id: text, key: text, date: '2026-11-04', day: 'Wed', start: '10:45', end: '12:15', slotLabel: '', subject: null,
    faculty, room: null, status: 'scheduled', sheet: 'S', cell: 'A1', text,
  });
  const timetable = {
    sessions: [session('TOD - Prof. Priya Chaudhary - Colosseum', 'Prof. Priya Chaudhary'), session('OM - Prof. Harish Rao', 'Prof. Harish Rao')],
    subjectOf: (s: Session) => s.text.split(' ')[0] ?? null,
  };

  it('finds the subject the sender teaches on the timetable', () => {
    expect(guessSubject({ senderName: 'Priya Chaudhary', emailSubject: 'Interview protocols', excerpt: '' }, subjects, timetable)?.code).toBe('TOD');
  });

  it('falls back to a subject named in the email', () => {
    expect(guessSubject({ senderName: 'Yukti Bajaj', emailSubject: 'Corporate Finance_Session 06', excerpt: '' }, subjects, timetable)?.code).toBe('CF');
  });

  it('does not match on a first name alone', () => {
    expect(guessSubject({ senderName: 'Priya Sharma', emailSubject: 'Hello', excerpt: '' }, subjects, timetable)).toBeNull();
  });
});
