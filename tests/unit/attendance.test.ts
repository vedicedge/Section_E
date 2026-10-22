import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIG,
  EMPTY_RECORD,
  applyDelta,
  boardOf,
  conditionLabel,
  conditionLine,
  configKeys,
  normaliseConfig,
  requiredOf,
  smallWord,
  standing,
  validateRecord,
  heldOf,
  type SubjectRecord,
} from '@/lib/attendance/calc';

const rec = (partial: Partial<SubjectRecord> = {}): SubjectRecord => ({ ...EMPTY_RECORD, ...partial });
const TODAY = '2026-10-22';

describe('requiredOf', () => {
  it('rounds attendance up with integer maths', () => {
    expect(requiredOf(20, 80)).toBe(16);
    expect(requiredOf(10, 80)).toBe(8);
    expect(requiredOf(15, 80)).toBe(12);
    expect(requiredOf(14, 80)).toBe(12);
    expect(requiredOf(4, 80)).toBe(4);
    expect(requiredOf(5, 80)).toBe(4);
  });

  it('has no floating-point drift: 80% of 20 is not 17', () => {
    expect(requiredOf(20, 80)).not.toBe(17);
  });

  it('handles fractional minimums', () => {
    expect(requiredOf(20, 75.5)).toBe(16);
  });
});

describe('the term table', () => {
  it('gives allowances 4,2,4,4,3,2,4 — 23 hearts', () => {
    const allowances = DEFAULT_CONFIG.subjects.map((s) => standing(s.total, null, 80).allowance);
    expect(allowances).toEqual([4, 2, 4, 4, 3, 2, 4]);
    expect(allowances.reduce((a, b) => a + b, 0)).toBe(23);
  });
});

describe('standing', () => {
  it('uses the student’s override', () => {
    const s = standing(20, rec({ totalOverride: 25 }), 80);
    expect(s.total).toBe(25);
    expect(s.required).toBe(20);
    expect(s.allowance).toBe(5);
  });

  it('never clamps missed, and flags inconsistent counts', () => {
    const s = standing(10, rec({ missed: 12 }), 80);
    expect(s.missed).toBe(12);
    expect(s.inconsistent).toBe(true);
    expect(standing(10, rec({ missed: 10 }), 80).inconsistent).toBe(false);
  });

  it('splits leaves into left and over', () => {
    expect(standing(20, rec({ missed: 1 }), 80)).toMatchObject({ left: 3, over: 0 });
    expect(standing(20, rec({ missed: 6 }), 80)).toMatchObject({ left: 0, over: 2 });
  });

  it('has a current percentage only when held is known and positive, counting held up to the leaves', () => {
    expect(standing(20, rec({ held: 0, missed: 0 }), 80).currentPercent).toBeNull();
    expect(standing(20, rec({ held: null, missed: 1 }), 80).currentPercent).toBeNull();
    expect(standing(20, rec({ held: 2, missed: 3 }), 80).currentPercent).toBe(0); // counted as 3 held, 3 missed
    expect(standing(20, rec({ held: 12, missed: 1 }), 80).currentPercent).toBeCloseTo(91.667, 2);
  });

  it('never gives a best percentage below 0', () => {
    expect(standing(10, rec({ missed: 15 }), 80).bestPercent).toBe(0);
    expect(standing(20, rec({ missed: 1 }), 80).bestPercent).toBe(95);
  });
});

describe('condition order', () => {
  const c = (total: number, missed: number) => standing(total, rec({ missed }), 80).condition;
  it('grades each case', () => {
    expect(c(4, 0)).toBe('no-reserve');
    expect(c(4, 1)).toBe('in-the-red');
    expect(c(20, 4)).toBe('spent');
    expect(c(9, 0)).toBe('mint'); // allowance 1, untouched → mint, not fragile
    expect(c(20, 3)).toBe('fragile');
    expect(c(20, 2)).toBe('fair');
    expect(c(20, 1)).toBe('fine');
    expect(c(20, 0)).toBe('mint');
  });

  it('labels', () => {
    expect(conditionLabel('no-reserve')).toBe('No reserve');
    expect(conditionLabel('in-the-red')).toBe('In the red');
    expect(conditionLabel('mint')).toBe('Mint');
  });
});

describe('applyDelta', () => {
  it('adds a leave', () => {
    expect(applyDelta(rec(), 1, 20)).toEqual({ record: rec({ missed: 1 }), heldRaised: false, capped: false });
  });

  it('clamps at 0 and flags capped', () => {
    expect(applyDelta(rec(), -1, 20)).toMatchObject({ record: { missed: 0 }, capped: true });
    expect(applyDelta(rec({ missed: 2 }), -5, 20)).toMatchObject({ record: { missed: 0 }, capped: true });
  });

  it('clamps at the total (the override when there is one)', () => {
    expect(applyDelta(rec({ missed: 19 }), 3, 20)).toMatchObject({ record: { missed: 20 }, capped: true });
    expect(applyDelta(rec({ missed: 4, totalOverride: 5 }), 2, 20)).toMatchObject({ record: { missed: 5 }, capped: true });
    expect(applyDelta(rec({ missed: 18 }), 2, 20).capped).toBe(false);
  });

  it('never lowers an inconsistent count on a strike, but still restores', () => {
    expect(applyDelta(rec({ missed: 12 }), 1, 10)).toMatchObject({ record: { missed: 12 }, capped: true });
    expect(applyDelta(rec({ missed: 12 }), -1, 10)).toMatchObject({ record: { missed: 11 }, capped: false });
  });

  it('counts held up with the leaves without rewriting it, so an undo takes the raise back', () => {
    const struck = applyDelta(rec({ held: 2, heldOn: '2026-10-01', missed: 2 }), 2, 20);
    expect(struck).toEqual({ record: rec({ held: 2, heldOn: '2026-10-01', missed: 4 }), heldRaised: true, capped: false });
    expect(heldOf(struck.record)).toBe(4);
    const undone = applyDelta(struck.record, -1, 20);
    expect(heldOf(undone.record)).toBe(3);
    expect(applyDelta(undone.record, -1, 20).record).toEqual(rec({ held: 2, heldOn: '2026-10-01', missed: 2 }));
  });

  it('only flags heldRaised when the count passes what was entered', () => {
    expect(applyDelta(rec({ held: 9, missed: 2 }), 2, 20).heldRaised).toBe(false);
    expect(applyDelta(rec({ missed: 2 }), 2, 20).heldRaised).toBe(false);
    expect(applyDelta(rec({ held: 10, missed: 10 }), 1, 10)).toMatchObject({ heldRaised: false, capped: true });
  });
});

describe('validateRecord', () => {
  it('accepts sensible numbers', () => {
    expect(validateRecord('DMA', { total: 20, held: 10, missed: 3 })).toBeNull();
    expect(validateRecord('DMA', { total: 20, held: null, missed: 20 })).toBeNull();
  });

  it('words leaves-over-total for the field being edited', () => {
    expect(validateRecord('DMA', { total: 10, held: null, missed: 12 }, 'total')).toEqual({
      field: 'total',
      message: 'DMA can’t have fewer sessions (10) than the leaves you’ve logged (12).',
    });
    expect(validateRecord('DMA', { total: 10, held: null, missed: 12 }, 'missed')).toEqual({
      field: 'missed',
      message: 'Leaves can’t be more than the 10 sessions.',
    });
    expect(validateRecord('DMA', { total: 10, held: null, missed: 12 })?.field).toBe('missed');
  });

  it('checks held against the total and the leaves', () => {
    expect(validateRecord('DMA', { total: 20, held: 21, missed: 0 })).toEqual({
      field: 'held',
      message: 'Held so far can’t be more than the 20 sessions.',
    });
    // Leaves past "held so far" only matter when held itself is being set; otherwise held counts up.
    expect(validateRecord('DMA', { total: 20, held: 2, missed: 3 }, 'missed')).toBeNull();
    expect(validateRecord('DMA', { total: 20, held: 2, missed: 3 }, 'held')).toEqual({
      field: 'held',
      message: 'You’ve logged 3 leaves but only 2 classes held — raise “held so far” or lower your leaves.',
    });
  });
});

describe('conditionLine', () => {
  const line = (total: number, missed: number, code = 'DMA') => conditionLine(code, standing(total, rec({ missed }), 80), 80);
  it('mint, by allowance', () => {
    expect(line(9, 0)).toBe('Its one heart, intact.');
    expect(line(10, 0)).toBe('Both hearts intact.');
    expect(line(20, 0)).toBe('All four hearts intact.');
  });

  it('every other condition', () => {
    expect(line(20, 1)).toBe('Three in hand. Spend them wisely.');
    expect(line(20, 2)).toBe('Two left — keep one for a rainy day.');
    expect(line(20, 3)).toBe('One heart left. Handle with care.');
    expect(line(20, 4)).toBe('No hearts left. Attend every remaining DMA class.');
    expect(line(4, 0, 'TOD')).toBe('At 80%, every TOD class counts — there’s no leave to spare.');
    expect(line(20, 5)).toBe('One over the line. You’re below 80% in DMA — talk to the faculty or your CR.');
  });

  it('formats a fractional minimum', () => {
    expect(conditionLine('DT', standing(4, rec(), 87.5), 87.5)).toBe('At 87.5%, every DT class counts — there’s no leave to spare.');
  });
});

describe('smallWord', () => {
  it('spells 0..10 and uses digits beyond', () => {
    expect(smallWord(0)).toBe('none');
    expect(smallWord(3, true)).toBe('Three');
    expect(smallWord(10)).toBe('ten');
    expect(smallWord(11)).toBe('11');
  });
});

describe('boardOf', () => {
  it('totals the term and lists subjects needing care, in config order', () => {
    const board = boardOf([
      { id: 'DMA', standing: standing(20, rec({ missed: 3 }), 80) }, // fragile
      { id: 'DT', standing: standing(10, rec({ missed: 4 }), 80) }, // 2 over
      { id: 'CF', standing: standing(20, rec(), 80) }, // untouched
      { id: 'OM', standing: standing(20, rec({ missed: 4 }), 80) }, // spent
      { id: 'TOD', standing: standing(4, rec(), 80) }, // no reserve: not untouched, not at risk
      { id: 'SM', standing: standing(20, rec({ missed: 1 }), 80) }, // fine
    ]);
    expect(board).toEqual({
      hearts: 4 + 2 + 4 + 4 + 0 + 4,
      left: 1 + 0 + 4 + 0 + 0 + 3,
      spent: 3 + 2 + 0 + 4 + 0 + 1,
      over: 2,
      overIds: ['DT'],
      atRiskIds: ['DMA', 'DT', 'OM'],
      untouchedIds: ['CF'],
    });
  });
});

describe('normaliseConfig', () => {
  it('fills ids, aliases and defaults', () => {
    const c = normaliseConfig({ subjects: [{ code: 'MM II', title: 'Marketing', total: 15 }, { id: 'DMA', code: 'DAM', total: 20, aliases: ['DMA'] }] });
    expect(c.enabled).toBe(true);
    expect(c.minPercent).toBe(80);
    expect(c.termLabel).toBe('Term II');
    expect(c.subjects).toEqual([
      { id: 'MMII', code: 'MM II', title: 'Marketing', total: 15, aliases: [] },
      { id: 'DMA', code: 'DAM', title: '', total: 20, aliases: ['DMA'] },
    ]);
  });

  it('keeps saved settings', () => {
    const c = normaliseConfig({ enabled: false, minPercent: 75, termLabel: 'Term III', subjects: [] });
    expect(c).toEqual({ enabled: false, minPercent: 75, termLabel: 'Term III', subjects: [] });
  });

  it('turns garbage into the defaults', () => {
    expect(normaliseConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(normaliseConfig('nope')).toEqual(DEFAULT_CONFIG);
    expect(normaliseConfig([1, 2])).toEqual(DEFAULT_CONFIG);
    expect(normaliseConfig({ minPercent: 'x', enabled: 'yes' })).toEqual(DEFAULT_CONFIG);
  });

  it('drops malformed subjects', () => {
    const c = normaliseConfig({ subjects: [{ code: '', total: 20 }, { code: 'SM', total: 0 }, { code: 'OM', total: 2.5 }, 7, { code: 'CF', total: 20 }] });
    expect(c.subjects.map((s) => s.id)).toEqual(['CF']);
  });

  it('does not share arrays with DEFAULT_CONFIG', () => {
    const c = normaliseConfig(undefined);
    c.subjects[0]!.aliases.push('X');
    expect(DEFAULT_CONFIG.subjects[0]!.aliases).toEqual([]);
  });
});

describe('configKeys', () => {
  it('normalises and de-duplicates code and aliases', () => {
    expect(configKeys({ code: 'MM II', aliases: ['MM-II', 'mm 2', 'Marketing II', '--'] })).toEqual(['MMII', 'MARKETINGII']);
  });
});
