import type { Transaction } from '../types/transaction';
import { normalizeStatus } from './status.ts';

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
    const s = normalizeStatus(tx.status);
    if (s === 'completed') {
      completed++;
      // Sum per currency — no cross-currency conversion.
      completedRevenue[tx.currency] = (completedRevenue[tx.currency] ?? 0) + tx.amount;
    } else if (s === 'pending') {
      pending++;
    } else if (s === 'failed') {
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
    const s = normalizeStatus(tx.status);
    if (s === 'completed') completed++;
    else if (s === 'pending') pending++;
    else if (s === 'failed') failed++;
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
 *
 * Produces a CONTINUOUS time series: every time bucket that should exist in the
 * selected range is present in the output, even if its value is zero.
 *
 * - Daily   → last 7 calendar days from Sunday through today
 * - Weekly  → last 12 consecutive ISO weeks (current week + 11 preceding)
 * - Monthly → last 12 calendar months (current month + 11 preceding)
 * - Yearly  → last 5 calendar years  (current year + 4 preceding)
 *
 * Returns an array of { label, value } sorted chronologically (oldest first).
 * Returns [] when no completed transactions exist.
 */
export function aggregateRevenueByPeriod(
  transactions: readonly Transaction[],
  period: Period,
): PeriodBucket[] {
  // 1. Filter to completed only.
  const completed = transactions.filter((tx) => normalizeStatus(tx.status) === 'completed');
  if (completed.length === 0) return [];

  // 2. Build a Map of bucket-label → total value from completed transactions.
  const buckets = new Map<string, number>();
  for (const tx of completed) {
    const label = bucketLabel(tx.timestamp, period);
    buckets.set(label, (buckets.get(label) ?? 0) + tx.amount);
  }

  // 3. Generate the full set of expected bucket labels for the chosen period,
  //    filling in any that have no data with 0.
  const allLabels = generatePeriodLabels(period);

  // 4. Map to PeriodBucket[], keeping the chronological order allLabels provides.
  return allLabels.map((label) => ({
    label,
    value: buckets.get(label) ?? 0,
  }));
}

/**
 * Generate the full set of expected period labels in chronological order.
 *
 * The range is anchored to the *current UTC date* — this ensures that real-time
 * additions near midnight are assigned to the correct calendar bucket according
 * to the project's UTC-based convention (see bucketLabel which uses getUTC*).
 */
function generatePeriodLabels(period: Period): string[] {
  const now = new Date(); // local time — but we use UTC for bucket keys, so anchor to UTC-now.
  const utcNow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  switch (period) {
    case 'daily': {
      // Current calendar week: Sunday through Saturday (always 7 days).
      // Days after today get value 0 (they exist as placeholders).
      const labels: string[] = [];
      const dayOfWeek = utcNow.getUTCDay(); // 0=Sun … 6=Sat
      const sunday = new Date(utcNow);
      sunday.setUTCDate(sunday.getUTCDate() - dayOfWeek); // roll back to Sunday
      for (let i = 0; i < 7; i++) {
        const d = new Date(sunday);
        d.setUTCDate(d.getUTCDate() + i);
        labels.push(formatDaily(d));
      }
      return labels;
    }
    case 'weekly': {
      // Last 12 ISO weeks: current week + 11 preceding weeks.
      const labels: string[] = [];
      const currentWeekStart = toWeekStart(utcNow);
      for (let i = 11; i >= 0; i--) {
        const w = new Date(currentWeekStart);
        w.setUTCDate(w.getUTCDate() - i * 7);
        labels.push(formatWeekly(w));
      }
      return labels;
    }
    case 'monthly': {
      // Last 12 calendar months: current month + 11 preceding months.
      const labels: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth() - i, 1));
        labels.push(formatMonthly(d));
      }
      return labels;
    }
    case 'yearly': {
      // Last 5 calendar years: current year + 4 preceding years.
      const labels: string[] = [];
      for (let i = 4; i >= 0; i--) {
        const y = utcNow.getUTCFullYear() - i;
        labels.push(String(y));
      }
      return labels;
    }
  }
}

/** Format a Date as a daily bucket key: "YYYY-MM-DD" (UTC). */
function formatDaily(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format a Date as a monthly bucket key: "YYYY-MM" (UTC). */
function formatMonthly(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** Format a Date as a weekly bucket key: "YYYY-Www" (ISO 8601, UTC). */
function formatWeekly(d: Date): string {
  // ISO 8601: Thursday determines which year the week belongs to.
  const d2 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  d2.setUTCDate(d2.getUTCDate() + 4 - (d2.getUTCDay() || 7));
  const year = d2.getUTCFullYear();
  const firstThu = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.ceil(((d2.getTime() - firstThu.getTime()) / 86400000) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Get the Monday (start) of the ISO week that contains the given date (UTC).
 */
function toWeekStart(d: Date): Date {
  const dayOfWeek = d.getUTCDay(); // 0=Sun .. 6=Sat
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday = 1, Sunday → go back 6 days
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday;
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

    const s = normalizeStatus(tx.status);
    if (s === 'completed') row.completed += tx.amount;
    else if (s === 'pending') row.pending += tx.amount;
    else if (s === 'failed') row.failed += tx.amount;
  }

  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
