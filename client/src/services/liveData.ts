import type { Transaction } from '../types/transaction';

/**
 * Pure feed helpers — sort + filter live transaction data, with no I/O and no
 * React. Kept in `services/` so the page and hook stay thin and the logic here
 * is trivially unit-testable.
 */

/** Sort newest-first by timestamp (live events may arrive out of order). */
export function sortNewestFirst(list: readonly Transaction[]): Transaction[] {
  return [...list].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

/** Feed filter: either the whole list, or failed transactions only. */
export type FeedFilter = 'all' | 'failed';

/**
 * Apply the status filter to a full feed. `'all'` passes everything through;
 * `'failed'` narrows to Failed transactions only.
 */
export function applyStatusFilter(list: readonly Transaction[], filter: FeedFilter): Transaction[] {
  if (filter === 'all') return [...list];
  return list.filter((tx) => tx.status === 'Failed');
}
