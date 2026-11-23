import type { FailureBudget } from './rate-limit';

/**
 * Per-account limits on wrong secrets (on top of the per-IP limits in each route). They count
 * failures from every address together, so spreading guesses over many IPs gains nothing.
 */

/** The one admin account: 20 wrong passwords per 15 minutes, 100 per day. */
export const ADMIN_FAILURE_BUDGETS: FailureBudget[] = [
  { key: 'admin-login-fail:15m', limit: 20, windowSeconds: 15 * 60 },
  { key: 'admin-login-fail:day', limit: 100, windowSeconds: 24 * 60 * 60 },
];

/**
 * A 4-digit PIN has 10,000 values, so the 15-minute limit alone would let a patient guesser through
 * in a few weeks. This caps wrong PINs per roll number per day; the recovery code still works.
 */
export const PIN_DAILY_LIMIT = 20;

export function pinFailureBudgets(rollNo: string): FailureBudget[] {
  return [{ key: `pin-roll-day:${rollNo}`, limit: PIN_DAILY_LIMIT, windowSeconds: 24 * 60 * 60 }];
}
