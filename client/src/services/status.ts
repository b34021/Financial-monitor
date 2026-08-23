/**
 * Runtime status normalizer — pure, side-effect free, no I/O, no React.
 *
 * The `Transaction` TS type promises `TransactionStatus` (a string union), but
 * live payloads from REST/SignalR are untyped at the boundary: a status can
 * slip in as a numeric enum index, an unexpected casing, `undefined`, or an
 * object. This module hardens the render path so a hostile/odd value can never
 * crash `.toLowerCase()`. Unknown values collapse to a neutral `'unknown'`.
 */

/** Normalized, render-safe status keys (used for badges + card accents). */
export type DisplayStatus = 'pending' | 'completed' | 'failed' | 'unknown';

/** Stable palette — colors are the single source of truth for CSS classes. */
export const STATUS_MAP: Record<DisplayStatus, { label: string; badge: string; card: string }> = {
  pending: { label: 'Pending', badge: 'badge--pending', card: 'tx-card--pending' },
  completed: { label: 'Completed', badge: 'badge--completed', card: 'tx-card--completed' },
  failed: { label: 'Failed', badge: 'badge--failed', card: 'tx-card--failed' },
  unknown: { label: 'Unknown', badge: 'badge--unknown', card: 'tx-card--unknown' },
};

/** Map a numeric enum index (the classic C# default) to its display key. */
const NUMERIC_STATUS: Record<number, DisplayStatus> = {
  0: 'pending',
  1: 'completed',
  2: 'failed',
};

/** Normalize any inbound value to a safe, lowercase display key. */
export function normalizeStatus(status: unknown): DisplayStatus {
  if (typeof status === 'string') {
    const key = status.trim().toLowerCase() as DisplayStatus;
    return key in STATUS_MAP ? key : 'unknown';
  }
  if (typeof status === 'number') {
    return NUMERIC_STATUS[status] ?? 'unknown';
  }
  return 'unknown';
}
