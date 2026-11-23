import { afterEach, describe, expect, it, vi } from 'vitest';
import { publicOrigin } from '@/lib/http';

const h = (values: Record<string, string>) => new Headers(values);
const spoofed = h({ host: 'section-e-lilac.vercel.app', 'x-forwarded-host': 'evil.example', 'x-forwarded-proto': 'https' });

afterEach(() => vi.unstubAllEnvs());

describe('publicOrigin', () => {
  it('uses the configured site address and ignores forwarded headers', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://section-e.example/');
    expect(publicOrigin(spoofed)).toBe('https://section-e.example');
  });

  it('on Vercel uses the production domain, never X-Forwarded-Host', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'section-e-lilac.vercel.app');
    expect(publicOrigin(spoofed)).toBe('https://section-e-lilac.vercel.app');
  });

  it('falls back to the request host only when nothing is configured (local dev)', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    expect(publicOrigin(h({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
    expect(publicOrigin(h({}))).toBeNull();
  });
});
