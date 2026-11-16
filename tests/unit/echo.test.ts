import { describe, expect, it } from 'vitest';
import { ECHO_URLS, LAST_ROLL_ON_FIRST_ECHO, echoUrlFor } from '@/lib/echo';

describe('which Echo a student belongs to', () => {
  it('sends roll numbers up to the cutoff to the first Echo and later ones to the second', () => {
    expect(echoUrlFor('25PGDM022R')).toBe(ECHO_URLS[0]);
    expect(echoUrlFor('26PGDM253')).toBe(ECHO_URLS[0]);
    expect(echoUrlFor(LAST_ROLL_ON_FIRST_ECHO)).toBe(ECHO_URLS[0]);
    expect(echoUrlFor('26PGDM285')).toBe(ECHO_URLS[1]);
    expect(echoUrlFor('26PGDM316')).toBe(ECHO_URLS[1]);
  });

  it('ignores case and stray spaces, and puts later batches on the second Echo', () => {
    expect(echoUrlFor(' 26pgdm284 ')).toBe(ECHO_URLS[0]);
    expect(echoUrlFor('26pgdm300')).toBe(ECHO_URLS[1]);
    expect(echoUrlFor('27PGDM001')).toBe(ECHO_URLS[1]);
  });

  it('keeps the two copies distinct, both on claude.ai', () => {
    expect(new Set(ECHO_URLS).size).toBe(2);
    for (const u of ECHO_URLS) expect(u).toMatch(/^https:\/\/claude\.ai\/artifact\/[A-Za-z0-9]+$/);
  });
});
