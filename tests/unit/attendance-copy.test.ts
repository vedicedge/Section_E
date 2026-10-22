import { describe, expect, it } from 'vitest';
import { boardOf, standing, type SubjectRecord } from '@/lib/attendance/calc';
import {
  attendNote,
  countWord,
  errorCopy,
  heartLabel,
  heldNote,
  liveCopy,
  listOf,
  methodCopy,
  plateCopy,
  previewCopy,
  rowSentence,
  toastCopy,
  whenLabel,
  type PlateSubject,
} from '@/app/(main)/attendance/copy';

const TODAY = '2026-10-22'; // a Thursday
const rec = (missed: number, extra: Partial<SubjectRecord> = {}): SubjectRecord => ({
  totalOverride: null,
  held: null,
  heldOn: null,
  missed,
  ...extra,
});

// The default term: DMA 20 · DT 10 · CF 20 · OM 20 · MM II 15 · TOD 14 · SM 20 (23 hearts at 80%).
const TERM: [string, string, number][] = [
  ['DMA', 'DMA', 20],
  ['DT', 'DT', 10],
  ['CF', 'CF', 20],
  ['OM', 'OM', 20],
  ['MMII', 'MM II', 15],
  ['TOD', 'TOD', 14],
  ['SM', 'SM', 20],
];

function term(missed: Record<string, number> = {}, nextClass: Record<string, PlateSubject['nextClass']> = {}) {
  const subjects: PlateSubject[] = TERM.map(([id, code, total]) => ({
    id,
    code,
    standing: standing(total, rec(missed[id] ?? 0), 80),
    nextClass: nextClass[id] ?? null,
  }));
  return { subjects, board: boardOf(subjects), minPercent: 80, today: TODAY };
}

describe('countWord', () => {
  it('spells 0–99 with a capital and digits above', () => {
    expect(countWord(0)).toBe('Zero');
    expect(countWord(2)).toBe('Two');
    expect(countWord(13)).toBe('Thirteen');
    expect(countWord(20)).toBe('Twenty');
    expect(countWord(23)).toBe('Twenty-three');
    expect(countWord(99)).toBe('Ninety-nine');
    expect(countWord(100)).toBe('100');
  });
});

describe('whenLabel', () => {
  it('says today, tomorrow or the day', () => {
    expect(whenLabel(TODAY, '10:30', TODAY)).toBe('today, 10:30 am');
    expect(whenLabel('2026-10-23', '14:05', TODAY)).toBe('tomorrow, 2:05 pm');
    expect(whenLabel('2026-10-27', '10:30', TODAY)).toBe('Tue 27 Oct, 10:30 am');
    expect(whenLabel('2026-10-27', null, TODAY)).toBe('Tue 27 Oct');
  });
});

describe('listOf', () => {
  it('joins with commas and "and"', () => {
    expect(listOf([])).toBe('');
    expect(listOf(['CF'])).toBe('CF');
    expect(listOf(['CF', 'SM'])).toBe('CF and SM');
    expect(listOf(['CF', 'OM', 'SM'])).toBe('CF, OM and SM');
  });
});

describe('plateCopy', () => {
  it('a fresh term is quiet and counts the hearts', () => {
    const p = plateCopy({ ...term(), hasAnyRecord: false });
    expect(p.tone).toBe('quiet');
    expect(p.label).toBe('Thu, 22 Oct · a fresh term');
    expect(p.title).toEqual(['23 hearts, ', 'untouched', '.']);
    expect(p.text).toMatch(/^Already missed a few\?/);
  });

  it('good standing names the untouched subjects', () => {
    const p = plateCopy({ ...term({ DMA: 2, OM: 1, MMII: 1 }), hasAnyRecord: true });
    expect(p.tone).toBe('quiet');
    expect(p.label).toBe('Your standing');
    expect(p.title).toEqual(['All in good ', 'standing', '.']);
    expect(p.text).toBe('19 of 23 hearts in hand. Untouched so far: DT, CF, TOD and SM.');
  });

  it('drops the untouched clause when all are untouched', () => {
    const p = plateCopy({ ...term(), hasAnyRecord: true });
    expect(p.text).toBe('23 of 23 hearts in hand.');
  });

  it('one fragile subject: its last heart, with the next class', () => {
    const p = plateCopy({ ...term({ TOD: 1 }, { TOD: { date: '2026-10-23', time: '10:30' } }), hasAnyRecord: true });
    expect(p.tone).toBe('red');
    expect(p.label).toBe('Mind the line');
    expect(p.title).toEqual(['', 'TOD', ' is down to its last heart.']);
    expect(p.text).toBe('Next TOD class: tomorrow, 10:30 am.');
    expect(p.rows).toEqual([{ id: 'TOD', code: 'TOD', sentence: 'one heart left' }]);
  });

  it('one spent subject; several need care', () => {
    expect(plateCopy({ ...term({ CF: 4 }), hasAnyRecord: true }).title).toEqual(['No hearts left in ', 'CF', '.']);
    const p = plateCopy({ ...term({ CF: 4, TOD: 1 }), hasAnyRecord: true });
    expect(p.title).toEqual(['Two subjects need ', 'care', '.']);
    expect(p.text).toBeNull();
    expect(p.rows.map((r) => r.sentence)).toEqual(['none left — attend every class', 'one heart left']);
  });

  it('over the line wins, and says what the term allows', () => {
    const p = plateCopy({ ...term({ DT: 3, TOD: 1 }), hasAnyRecord: true });
    expect(p.label).toBe('In the red');
    expect(p.title).toEqual(['Below the line in ', 'DT', '.']);
    expect(p.text).toBe('You’ve missed 3 DT classes; at 80% the term allows 2. Talk to the faculty or your CR — sooner is kinder.');
    expect(p.rows[0]).toEqual({ id: 'DT', code: 'DT', sentence: '1 over the line — below 80%' });
    const two = plateCopy({ ...term({ DT: 3, CF: 5 }), hasAnyRecord: true });
    expect(two.title).toEqual(['Below the line in ', 'two subjects', '.']);
  });
});

describe('rowSentence', () => {
  it('covers the three at-risk conditions', () => {
    expect(rowSentence(standing(20, rec(3), 80), 80)).toBe('one heart left');
    expect(rowSentence(standing(20, rec(4), 80), 80)).toBe('none left — attend every class');
    expect(rowSentence(standing(20, rec(6), 75), 75)).toBe('1 over the line — below 75%');
  });
});

describe('heartLabel and liveCopy', () => {
  it('names every state', () => {
    expect(heartLabel('DMA', 'intact', 4, 4)).toBe('DMA heart 4 of 4: intact. Press to strike off a leave.');
    expect(heartLabel('DMA', 'spent', 4, 4)).toBe('DMA heart 4 of 4: struck off. Press to restore the latest leave.');
    expect(heartLabel('DMA', 'over', 2, 4)).toBe('DMA leave 2 over the limit. Press to remove it.');
    expect(heartLabel('DMA', 'ghost', 0, 4)).toBe('Mark another DMA leave, past the limit');
  });
  it('announces what is left, or how far over', () => {
    expect(liveCopy('DMA', standing(20, rec(1), 80))).toBe('DMA: 3 of 4 hearts left.');
    expect(liveCopy('DMA', standing(20, rec(5), 80))).toBe('DMA: 1 over the limit.');
  });
});

describe('toastCopy', () => {
  it('words each kind', () => {
    expect(toastCopy('strike', 'DMA', standing(20, rec(1), 80))).toBe('Struck a DMA heart — 3 left.');
    expect(toastCopy('strike', 'DMA', standing(20, rec(4), 80))).toBe('Struck DMA’s last heart — attend every DMA class from here.');
    expect(toastCopy('mend', 'DMA', standing(20, rec(0), 80))).toBe('Restored a DMA heart — 4 left.');
    expect(toastCopy('over', 'DMA', standing(20, rec(5), 80), 80)).toBe('Marked a DMA leave past the limit — you’re below 80% in DMA.');
    expect(toastCopy('unover', 'DMA', standing(20, rec(4), 80), 80)).toBe('Removed a DMA leave past the limit — you’re back on the line.');
    expect(toastCopy('unover', 'DMA', standing(20, rec(6), 80), 80)).toBe('Removed a DMA leave past the limit — still 2 over.');
    expect(toastCopy('saved', 'DMA', standing(20, null, 80))).toBe('DMA numbers saved.');
    expect(toastCopy('held', 'DMA', standing(20, null, 80), 7)).toBe(' Held so far raised to 7 to match.');
    expect(toastCopy('full', 'DMA', standing(20, rec(20), 80))).toBe('Every DMA session is already marked missed — check your total.');
  });
});

describe('errorCopy', () => {
  it('maps statuses to plain sentences', () => {
    expect(errorCopy(429, 'x')).toBe('You’re updating very fast — give it a moment.');
    expect(errorCopy(404, 'x')).toBe('That subject just changed — reloading…');
    expect(errorCopy(401, 'x')).toBe('Your session has ended.');
    expect(errorCopy(0, 'You seem to be offline. Check your connection and try again.')).toBe(
      'Not saved — You seem to be offline. Check your connection and try again. Your hearts are back as they were.',
    );
  });
});

describe('methodCopy', () => {
  it('shows the rounding at 80% of 14', () => {
    expect(methodCopy(80)).toBe(
      'Hearts are the classes you can miss and still reach 80%. 80% of 14 sessions is 11.2, so you must attend 12 — that leaves 2 hearts, not 3. Attendance rounds up; leave never does.',
    );
  });
  it('drops "not N" when nothing rounds', () => {
    expect(methodCopy(50)).toBe(
      'Hearts are the classes you can miss and still reach 50%. 50% of 14 sessions is 7, so you must attend 7 — that leaves 7 hearts. Attendance rounds up; leave never does.',
    );
  });
});

describe('notes and preview', () => {
  it('attend, held and preview lines', () => {
    expect(attendNote(standing(20, rec(1), 80))).toBe('Attend 16 of 20 · on course for 95%');
    const s = standing(20, rec(1, { held: 12, heldOn: '2026-10-14' }), 80);
    expect(heldNote(12, '2026-10-14', s)).toBe('Attended 11 of 12 held so far — 91.7% · as of 14 Oct');
    expect(heldNote(0, null, standing(20, rec(0, { held: 0 }), 80))).toBeNull();
    expect(previewCopy(standing(20, rec(3, { totalOverride: 22 }), 80))).toBe('With 22 sessions: attend 18 · 4 hearts · 1 left.');
    expect(previewCopy(standing(20, rec(4, { totalOverride: 18 }), 80))).toBe('With 18 sessions: attend 15 · 3 hearts · 1 over the line.');
  });
});

describe('articles before subject codes', () => {
  it('follows how the code is spoken', async () => {
    const { a } = await import('@/app/(main)/attendance/copy');
    expect(['DMA', 'DT', 'CF', 'TOD', 'SM', 'OM', 'MM II'].map(a)).toEqual(['a DMA', 'a DT', 'a CF', 'a TOD', 'an SM', 'an OM', 'an MM II']);
  });
});
