import { describe, expect, it } from 'vitest';
import { RELAY_FULL_CHECK_MS, relayNeedsFile, type RelayCopyFacts } from '@/lib/timetable/relay-policy';

const NOW = Date.parse('2026-11-12T06:00:00.000Z');
const EDITED = '2026-11-10T11:19:00.000Z';
const current = { parserVersion: 3, section: 'E' };
const copy = (over: Partial<RelayCopyFacts> = {}): RelayCopyFacts => ({
  sourceKey: 'relay',
  sourceModifiedAt: EDITED,
  parserVersion: 3,
  section: 'E',
  receivedAt: new Date(NOW - 60_000).toISOString(),
  ...over,
});

describe('relayNeedsFile', () => {
  it('skips the file when the edit time matches and the last full copy is recent', () => {
    expect(relayNeedsFile(copy(), EDITED, current, NOW)).toBe(false);
    expect(relayNeedsFile(copy({ receivedAt: new Date(NOW - RELAY_FULL_CHECK_MS + 60_000).toISOString() }), EDITED, current, NOW)).toBe(false);
  });

  it('asks for the whole file every 6 hours even when the sheet was not edited', () => {
    expect(relayNeedsFile(copy({ receivedAt: new Date(NOW - RELAY_FULL_CHECK_MS).toISOString() }), EDITED, current, NOW)).toBe(true);
    expect(relayNeedsFile(copy({ receivedAt: new Date(NOW - 7 * 3600_000).toISOString() }), EDITED, current, NOW)).toBe(true);
    expect(RELAY_FULL_CHECK_MS).toBe(6 * 3600 * 1000);
  });

  it('asks for the file for copies saved before full checks were tracked', () => {
    expect(relayNeedsFile(copy({ receivedAt: undefined }), EDITED, current, NOW)).toBe(true);
    expect(relayNeedsFile(copy({ receivedAt: 'not a date' }), EDITED, current, NOW)).toBe(true);
  });

  it('asks for the file whenever the copy is in doubt', () => {
    expect(relayNeedsFile(null, EDITED, current, NOW)).toBe(true);
    expect(relayNeedsFile(copy(), '2026-11-11T09:00:00.000Z', current, NOW)).toBe(true); // edited since
    expect(relayNeedsFile(copy(), null, current, NOW)).toBe(true); // relay sent no edit time
    expect(relayNeedsFile(copy({ sourceKey: 'https://docs.google.com/x' }), EDITED, current, NOW)).toBe(true); // came from the link
    expect(relayNeedsFile(copy({ parserVersion: 2 }), EDITED, current, NOW)).toBe(true); // parser upgraded
    expect(relayNeedsFile(copy({ section: 'D' }), EDITED, current, NOW)).toBe(true); // section changed
  });
});
