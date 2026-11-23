import { describe, expect, it } from 'vitest';
import {
  cleanCovered,
  isRevisionOpen,
  normaliseSettings,
  parseRevisionBulk,
  splitKeyPoints,
  statusOf,
  wordCount,
  DEFAULT_REVISION_SETTINGS,
} from '@/lib/revision/model';

describe('isRevisionOpen', () => {
  it('opens on the date in auto mode', () => {
    const s = { mode: 'auto' as const, opensOn: '2026-12-15' };
    expect(isRevisionOpen(s, '2026-12-14')).toBe(false);
    expect(isRevisionOpen(s, '2026-12-15')).toBe(true);
    expect(isRevisionOpen(s, '2027-01-02')).toBe(true);
  });
  it('on and off ignore the date', () => {
    expect(isRevisionOpen({ mode: 'on', opensOn: '2099-01-01' }, '2026-11-23')).toBe(true);
    expect(isRevisionOpen({ mode: 'off', opensOn: '2000-01-01' }, '2026-11-23')).toBe(false);
  });
  it('defaults to hidden until 15 Dec 2026', () => {
    expect(normaliseSettings(null)).toEqual(DEFAULT_REVISION_SETTINGS);
    expect(normaliseSettings({ mode: 'weird' })).toEqual(DEFAULT_REVISION_SETTINGS);
    expect(isRevisionOpen(normaliseSettings(null), '2026-11-23')).toBe(false);
    expect(isRevisionOpen(normaliseSettings(null), '2026-12-15')).toBe(true);
  });
});

describe('parseRevisionBulk', () => {
  const text = `Subject: sm
Title: Five forces
Minutes: 20 min
Marks: 10
Question:
A D2C brand wants to enter tier-2 cities.
Advise it.
Model answer:
Start with entrants.

Then buyers.
Key points:
- Entrants high
• Buyers strong
1. Recommendation
---
Question: What is NPV?
Answer: The present value of cash flows minus the investment.
Points:
* Discounting`;

  it('reads several questions with multi-line fields', () => {
    const { items, errors } = parseRevisionBulk(text, { subject: 'CF' });
    expect(errors).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      subject: 'SM',
      title: 'Five forces',
      minutes: 20,
      marks: 10,
      prompt: 'A D2C brand wants to enter tier-2 cities.\nAdvise it.',
      modelAnswer: 'Start with entrants.\n\nThen buyers.',
      keyPoints: ['Entrants high', 'Buyers strong', 'Recommendation'],
    });
    // Defaults: subject from the box, title from the question, 15 minutes, no marks.
    expect(items[1]).toMatchObject({ subject: 'CF', title: 'What is NPV?', minutes: 15, marks: null, keyPoints: ['Discounting'] });
  });

  it('reports the question that is missing something', () => {
    const { items, errors } = parseRevisionBulk('Subject: OM\nQuestion: Explain Little’s law.\n---\nSubject: OM\nQuestion: x\nModel answer: y');
    expect(items).toHaveLength(1);
    expect(errors).toEqual(['Question 1: Add the model answer.']);
  });

  it('needs a subject from the paste or the default', () => {
    expect(parseRevisionBulk('Question: q\nModel answer: a').errors[0]).toMatch(/subject/i);
  });

  it('rejects an empty paste', () => {
    expect(parseRevisionBulk('  \n---\n ').errors).toEqual(['Nothing to add. Paste at least one question.']);
  });
});

describe('helpers', () => {
  it('splits key points, dropping bullets and blanks', () => {
    expect(splitKeyPoints('- a\n\n  2) b \n•c')).toEqual(['a', 'b', 'c']);
  });
  it('keeps only ticks that point at existing key points', () => {
    expect(cleanCovered([3, 0, 0, 9, -1, 1.5, 'x'], 4)).toEqual([0, 3]);
    expect(cleanCovered('nope', 4)).toEqual([]);
  });
  it('works out a question’s status', () => {
    expect(statusOf(undefined)).toBe('new');
    expect(statusOf({ draft: '  ', revealedAt: null, nailedAt: null })).toBe('new');
    expect(statusOf({ draft: 'x', revealedAt: null, nailedAt: null })).toBe('drafted');
    expect(statusOf({ draft: 'x', revealedAt: '2026-12-15T00:00:00Z', nailedAt: null })).toBe('checked');
    expect(statusOf({ draft: '', revealedAt: '2026-12-15T00:00:00Z', nailedAt: '2026-12-15T00:00:00Z' })).toBe('nailed');
  });
  it('counts words', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount(' one  two\nthree ')).toBe(3);
  });
});
