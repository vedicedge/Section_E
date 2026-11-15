import { describe, expect, it } from 'vitest';
import { comingUp, countdownLabel, daysUntil, examCountdown, parseDateLines, parseLooseDate, parseLooseTime, type KeyDate } from '@/lib/coming-up';
import { pushBody, whatsappMessage, whatsappUrl } from '@/lib/announcement-text';
import { answersVisible, selectMistakes } from '@/lib/quizzes/mistakes';
import type { GradeResult } from '@/lib/quizzes/grading';

const date = (over: Partial<KeyDate>): KeyDate => ({ id: 'd', kind: 'event', subject: null, title: 'T', onDate: '2026-11-20', atTime: null, details: '', ...over });

describe('coming up', () => {
  const today = '2026-11-15';

  it('merges dates, unfinished homework and tests, soonest first, within the window', () => {
    const items = comingUp(
      {
        dates: [date({ id: 'a', kind: 'exam', subject: 'CF', title: 'End-term', onDate: '2026-11-18', atTime: '10:00' }), date({ id: 'old', onDate: '2026-11-14' }), date({ id: 'far', onDate: '2026-12-30' })],
        homework: [
          { id: 'h1', subjectCode: 'TOD', title: 'Case write-up', done: false, due: { date: '2026-11-16', time: '09:00' } },
          { id: 'h2', subjectCode: 'TOD', title: 'Done already', done: true, due: { date: '2026-11-16', time: null } },
          { id: 'h3', subjectCode: 'SM', title: 'No date yet', done: false, due: { date: null, time: null } },
        ],
        quizzes: [{ id: 'q', title: 'SM quiz', subject: 'SM', opensAt: null, closesAt: '2026-11-18T12:30:00.000Z', phase: 'live' }],
      },
      { today, days: 14 },
    );
    expect(items.map((i) => i.key)).toEqual(['hw-h1', 'date-a', 'qc-q']);
    expect(items[2]!.time).toBe('18:00'); // 12:30 UTC = 6 pm IST
    expect(items[1]!.label).toBe('Exam');
  });

  it('limits the list', () => {
    const dates = Array.from({ length: 12 }, (_, i) => date({ id: String(i), onDate: '2026-11-16' }));
    expect(comingUp({ dates, homework: [], quizzes: [] }, { today, limit: 8 })).toHaveLength(8);
  });

  it('counts down to the first exam still ahead', () => {
    const c = examCountdown([date({ id: 'e2', kind: 'exam', onDate: '2026-12-10' }), date({ id: 'e1', kind: 'exam', onDate: '2026-12-08' }), date({ kind: 'event', onDate: '2026-11-16' })], today);
    expect(c?.days).toBe(23);
    expect(c?.first.id).toBe('e1');
    expect(c?.remaining.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(examCountdown([date({ kind: 'exam', onDate: '2026-11-10' })], today)).toBeNull();
    expect(countdownLabel(0)).toMatch(/today/);
    expect(countdownLabel(1)).toBe('day to the first exam');
    expect(daysUntil('2027-01-01', '2026-12-31')).toBe(1);
  });
});

describe('pasted schedules', () => {
  const today = '2026-11-15';

  it('reads common date and time formats', () => {
    expect(parseLooseDate('2026-12-08')).toBe('2026-12-08');
    expect(parseLooseDate('08/12/2026')).toBe('2026-12-08');
    expect(parseLooseDate('8 Dec 2026')).toBe('2026-12-08');
    expect(parseLooseDate('8 December', today)).toBe('2026-12-08');
    expect(parseLooseDate('5 Jan', today)).toBe('2027-01-05'); // next January, not last
    expect(parseLooseDate('31/02/2026')).toBeNull();
    expect(parseLooseTime('10:00')).toBe('10:00');
    expect(parseLooseTime('2 pm')).toBe('14:00');
    expect(parseLooseTime('12:30am')).toBe('00:30');
    expect(parseLooseTime('14.30')).toBe('14:30');
    expect(parseLooseTime('10')).toBeNull();
  });

  it('parses lines with commas or tabs, an optional title and time', () => {
    const { rows, errors } = parseDateLines('8 Dec, CF, End-term exam, 10:00\n\n2026-12-10\tmm ii\t\t2 pm\nsoon, OB', today);
    expect(rows).toEqual([
      { line: 1, subject: 'CF', title: 'End-term exam', onDate: '2026-12-08', atTime: '10:00' },
      { line: 3, subject: 'MM II', title: 'MM II exam', onDate: '2026-12-10', atTime: '14:00' },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^Line 4/);
  });
});

describe('announcement wording', () => {
  const a = { title: 'No class Friday', body: 'CF moves to Saturday 10 am.', link: 'https://example.com/x' };

  it('builds the WhatsApp message and link', () => {
    expect(whatsappMessage(a, 'https://site.example/')).toBe('*No class Friday*\n\nCF moves to Saturday 10 am.\n\nhttps://example.com/x\n\nSection E · https://site.example/announcements');
    expect(whatsappUrl(a, 'https://site.example')).toMatch(/^https:\/\/wa\.me\/\?text=\*No%20class%20Friday\*%0A/);
  });

  it('keeps the push body short and never empty', () => {
    expect(pushBody({ ...a, body: 'x'.repeat(400) })).toHaveLength(160);
    expect(pushBody({ ...a, body: '' })).toMatch(/Open Section E/);
  });
});

describe('mistakes notebook', () => {
  const result = (questions: GradeResult['questions']): GradeResult => ({ score: 0, maxScore: 0, correct: 0, wrong: 0, skipped: 0, questions });
  const q = (id: string, quizId = 'z', position = 0) => ({ id, quizId, position, prompt: id, options: [{ id: 'a', text: 'A' }], correct: ['a'], explanation: '' });
  const r = (questionId: string, outcome: 'correct' | 'wrong' | 'skipped') => ({ questionId, chosen: [], correct: ['a'], outcome, awarded: 0, points: 1 });

  it('follows the result page rule for showing answers', () => {
    expect(answersVisible('after_each', false)).toBe(true);
    expect(answersVisible('after_submit', false)).toBe(true);
    expect(answersVisible('after_close', false)).toBe(false);
    expect(answersVisible('after_close', true)).toBe(true);
    expect(answersVisible('never', true)).toBe(false);
  });

  it('uses only the latest attempt per quiz and skips cleared or removed questions', () => {
    const mistakes = selectMistakes(
      [
        { quizId: 'z', submittedAt: '2026-11-10T00:00:00Z', result: result([r('q1', 'wrong'), r('q2', 'wrong')]) },
        { quizId: 'z', submittedAt: '2026-11-12T00:00:00Z', result: result([r('q1', 'correct'), r('q2', 'skipped'), r('q3', 'wrong'), r('gone', 'wrong')]) },
      ],
      [q('q1'), q('q2', 'z', 1), q('q3', 'z', 2)],
      new Set(['q3']),
    );
    expect(mistakes.map((m) => [m.questionId, m.outcome])).toEqual([['q2', 'skipped']]);
  });
});
