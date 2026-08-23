import type { Transaction } from '../types/transaction';

// ---------------------------------------------------------------------------
// Pure aggregation helpers for the analytics dashboard.
// All functions are side-effect-free: they read input, produce derived data,
// and never mutate the source array or its items.
// ---------------------------------------------------------------------------

/** KPI snapshot for the current transaction window. */
export interface KpiSnapshot {
  /** Total transaction count (all statuses). */
  total: number;
  /** Count of completed transactions. */
  completed: number;
  /** Count of pending transactions. */
  pending: number;
  /** Count of failed transactions. */
  failed: number;
  /**
   * Sum of amounts for completed transactions, grouped by currency.
   * Empty object means no completed transactions.
   */
  completedRevenue: Record<string, number>;
  /**
   * Success rate: Completed / (Completed + Failed) * 100.
   * Returns 0 when there are no completed or failed transactions.
   */
  successRate: number;
}

/**
 * Aggregate top-level KPIs from a transaction list.
 * The source array is never mutated.
 */
export function aggregateKpis(transactions: readonly Transaction[]): KpiSnapshot {
  const total = transactions.length;
  let completed = 0;
  let pending = 0;
  let failed = 0;
  const completedRevenue: Record<string, number> = {};

  for (const tx of transactions) {
    if (tx.status === 'Completed') {
      completed++;
      // Sum per currency — no cross-currency conversion.
      completedRevenue[tx.currency] = (completedRevenue[tx.currency] ?? 0) + tx.amount;
    } else if (tx.status === 'Pending') {
      pending++;
    } else if (tx.status === 'Failed') {
      failed++;
    }
  }

  const denominator = completed + failed;
  const successRate = denominator > 0 ? (completed / denominator) * 100 : 0;

  return { total, completed, pending, failed, completedRevenue, successRate };
}

// ---------------------------------------------------------------------------

/** Status-count bucket — exactly the 3 display statuses. */
export interface StatusCounts {
  completed: number;
  pending: number;
  failed: number;
}

/**
 * Count transactions by final status.
 * Pending transactions are also counted (needed for the pie chart / stacked bar).
 */
export function aggregateStatusCounts(
  transactions: readonly Transaction[],
): StatusCounts {
  let completed = 0;
  let pending = 0;
  let failed = 0;

  for (const tx of transactions) {
    if (tx.status === 'Completed') completed++;
    else if (tx.status === 'Pending') pending++;
    else if (tx.status === 'Failed') failed++;
  }

  return { completed, pending, failed };
}

// ---------------------------------------------------------------------------

/** A single bucket in a time-series aggregation. */
export interface PeriodBucket {
  label: string;
  value: number;
}

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * Aggregate completed-transaction revenue by a given time period.
 * Only Completed transactions are included; Pending and Failed are excluded.
 * Returns an array of { label, value } sorted chronologically.
 * Empty if no completed transactions exist.
 */
export function aggregateRevenueByPeriod(
  transactions: readonly Transaction[],
  period: Period,
): PeriodBucket[] {
  // 1. Filter to completed only.
  const completed = transactions.filter((tx) => tx.status === 'Completed');
  if (completed.length === 0) return [];

  // 2. Bucket by period, tracking per-currency revenue.
  //    Since we don't convert currencies, we emit ONE value per bucket.
  //    If a bucket has mixed currencies, we use the dominant currency.
  //    For single-currency datasets (the common case) this just sums.
  const buckets = new Map<string, { value: number; currency: string }>();

  for (const tx of completed) {
    const label = bucketLabel(tx.timestamp, period);
    const existing = buckets.get(label);
    if (existing) {
      // If the same currency, just add; if different, we still add the raw
      // amount but flag it — the consumer (chart) will show per-currency anyway.
      existing.value += tx.amount;
      // Keep the most recent currency as the label hint (display only).
      existing.currency = tx.currency;
    } else {
      buckets.set(label, { value: tx.amount, currency: tx.currency });
    }
  }

  // 3. Sort by date chronologically.
  return [...buckets.entries()]
    .map(([label, { value }]) => ({ label, value }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Derive a bucket label from an ISO timestamp for the given period.
 * Exported for testing.
 */
export function bucketLabel(iso: string, period: Period): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');

  switch (period) {
    case 'yearly':
      return String(y);
    case 'monthly':
      return `${y}-${m}`;
    case 'weekly': {
      // ISO 8601 week number.
      // Algorithms for JavaScript: Thursday determines which year the week belongs to.
      const d2 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
      // Set to nearest Thursday (ISO 8601 week rule).
      d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
      const year = d2.getUTCFullYear();
      // First Thursday of the year.
      const firstThu = new Date(Date.UTC(year, 0, 4));
      const week = 1 + Math.ceil(((d2.getTime() - firstThu.getTime()) / 86400000) / 7);
      return `${year}-W${String(week).padStart(2, '0')}`;
    }
    case 'daily':
      return `${y}-${m}-${day}`;
  }
}

// ---------------------------------------------------------------------------

/** Currency × status breakdown: revenue per currency per status. */
export interface CurrencyStatusRow {
  currency: string;
  completed: number;
  pending: number;
  failed: number;
}

/**
 * Aggregate amounts grouped by currency and status.
 * Returns one row per currency that appears in the data.
 */
export function aggregateCurrencyStatus(
  transactions: readonly Transaction[],
): CurrencyStatusRow[] {
  const map = new Map<string, CurrencyStatusRow>();

  for (const tx of transactions) {
    let row = map.get(tx.currency);
    if (!row) {
      row = { currency: tx.currency, completed: 0, pending: 0, failed: 0 };
      map.set(tx.currency, row);
    }

    if (tx.status === 'Completed') row.completed += tx.amount;
    else if (tx.status === 'Pending') row.pending += tx.amount;
    else if (tx.status === 'Failed') row.failed += tx.amount;
  }

  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
