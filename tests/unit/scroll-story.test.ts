import { describe, expect, it } from 'vitest';
import { labelState } from '@/app/ScrollStory';

// The counter on the home page's tools story. The CSS keyframes (dialLabel / dialFirst / dialLast in
// page.module.css) and this function must give the same curve, so older iPhones match newer ones.
describe('scroll story counter labels (older-browser fallback)', () => {
  it('fades a middle label in over the first 15% and out over the last 15%', () => {
    expect(labelState(0, false, false)[0]).toBe(0);
    expect(labelState(0.075, false, false)[0]).toBeCloseTo(0.5);
    expect(labelState(0.15, false, false)[0]).toBe(1);
    expect(labelState(0.5, false, false)[0]).toBe(1);
    expect(labelState(0.85, false, false)[0]).toBe(1);
    expect(labelState(0.925, false, false)[0]).toBeCloseTo(0.5);
    expect(labelState(1, false, false)[0]).toBe(0);
  });

  it('comes in from below and leaves upwards', () => {
    expect(labelState(0.05, false, false)[1]).toBe(1);
    expect(labelState(0.95, false, false)[1]).toBe(-1);
    expect(labelState(0.5, false, false)[1]).toBeCloseTo(0);
  });

  it('shows the first label before its card arrives and the last after its card has passed', () => {
    expect(labelState(0, true, false)[0]).toBe(1);
    expect(labelState(0.92, true, false)[0]).toBeCloseTo(0.53, 1);
    expect(labelState(1, false, true)[0]).toBe(1);
    expect(labelState(0.075, false, true)[0]).toBeCloseTo(0.5);
  });

  it('never shows two labels at once when one card hands over to the next', () => {
    // When card i's slot ends (x = 1) the next card's slot starts (x = 0).
    for (const t of [0.86, 0.9, 0.95, 1]) {
      const leaving = labelState(t, false, false)[0];
      const arriving = labelState(0, false, false)[0];
      expect(leaving + arriving).toBeLessThanOrEqual(1);
    }
  });
});
