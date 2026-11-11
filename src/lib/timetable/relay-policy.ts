/**
 * When the Apps Script relay checks in (every 10 minutes) it tells us the sheet's "last edited"
 * time, and we answer whether we need the workbook itself.
 *
 * We ask for it when anything about our copy is in doubt — and, regardless of the edit time, at
 * least every RELAY_FULL_CHECK_MS. That periodic full check re-reads Section E's classes from the
 * real file even if Drive's edit time didn't move (it can lag, or miss edits made in Office mode),
 * so changes are never held back by a stale timestamp.
 */
export const RELAY_FULL_CHECK_MS = 6 * 3600 * 1000;

export interface RelayCopyFacts {
  sourceKey: string;
  sourceModifiedAt: string | null;
  parserVersion: number;
  section?: string;
  /** When the relay last sent us the whole workbook (not just a check-in). */
  receivedAt?: string;
}

export function relayNeedsFile(
  copy: RelayCopyFacts | null,
  modifiedAt: string | null,
  current: { parserVersion: number; section: string },
  now: number = Date.now(),
): boolean {
  if (
    !copy ||
    copy.sourceKey !== 'relay' ||
    !modifiedAt ||
    copy.sourceModifiedAt !== modifiedAt ||
    copy.parserVersion !== current.parserVersion ||
    copy.section !== current.section
  ) {
    return true;
  }
  const received = copy.receivedAt ? Date.parse(copy.receivedAt) : Number.NaN;
  // Unknown (copies saved before this field existed) or older than the full-check interval.
  return !(received > now - RELAY_FULL_CHECK_MS);
}
