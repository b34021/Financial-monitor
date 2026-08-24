import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateKpis,
  aggregateStatusCounts,
  aggregateRevenueByPeriod,
  aggregateCurrencyStatus,
  bucketLabel,
} from '../src/services/aggregations.ts';
import type { Transaction } from '../src/types/transaction.ts';

// ---------------------------------------------------------------------------
//  Helper — builds a minimal Transaction with overrides.
// ---------------------------------------------------------------------------
function tx(overrides: Partial<Transaction> & { status: Transaction['status'] }): Transaction {
  return {
    transactionId: crypto.randomUUID(),
    amount: 100,
    currency: 'USD',
    timestamp: '2026-08-21T12:00:00+00:00',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
//  aggregateKpis
// ---------------------------------------------------------------------------
describe('aggregateKpis', () => {
  it('returns zeros for an empty list', () => {
    const k = aggregateKpis([]);
    assert.equal(k.total, 0);
    assert.equal(k.completed, 0);
    assert.equal(k.pending, 0);
    assert.equal(k.failed, 0);
    assert.deepEqual(k.completedRevenue, {});
    assert.equal(k.successRate, 0);
  });

  it('counts by status correctly', () => {
    const list = [
      tx({ status: 'Completed' }),
      tx({ status: 'Completed' }),
      tx({ status: 'Pending' }),
      tx({ status: 'Failed' }),
    ];
    const k = aggregateKpis(list);
    assert.equal(k.total, 4);
    assert.equal(k.completed, 2);
    assert.equal(k.pending, 1);
    assert.equal(k.failed, 1);
  });

  it('sums completed revenue per currency', () => {
    const list = [
      tx({ amount: 100, currency: 'USD', status: 'Completed' }),
      tx({ amount: 200, currency: 'USD', status: 'Completed' }),
      tx({ amount: 50, currency: 'ILS', status: 'Completed' }),
      tx({ amount: 500, currency: 'EUR', status: 'Pending' }), // not completed — excluded
    ];
    const k = aggregateKpis(list);
    assert.equal(k.completedRevenue['USD'], 300);
    assert.equal(k.completedRevenue['ILS'], 50);
    // Pending EUR must NOT appear in completedRevenue.
    assert.equal(k.completedRevenue['EUR'], undefined);
  });

  it('calculates successRate = Completed / (Completed + Failed) * 100', () => {
    const list = [
      tx({ status: 'Completed' }),
      tx({ status: 'Completed' }),
      tx({ status: 'Completed' }),
      tx({ status: 'Failed' }),
      tx({ status: 'Pending' }), // excluded from denominator
    ];
    const k = aggregateKpis(list);
    assert.equal(k.successRate, 75); // 3/(3+1)*100
  });

  it('successRate is 0 when no completed or failed transactions', () => {
    const list = [tx({ status: 'Pending' })];
    assert.equal(aggregateKpis(list).successRate, 0);
  });

  it('successRate is 100 when all are completed', () => {
    const list = [tx({ status: 'Completed' }), tx({ status: 'Completed' })];
    assert.equal(aggregateKpis(list).successRate, 100);
  });

  it('does not mutate the input array', () => {
    const list = [tx({ status: 'Completed' })];
    const original = [...list];
    aggregateKpis(list);
    assert.deepEqual(list, original);
  });
});

// ---------------------------------------------------------------------------
//  aggregateStatusCounts
// ---------------------------------------------------------------------------
describe('aggregateStatusCounts', () => {
  it('counts each status type', () => {
    const list = [
      tx({ status: 'Completed' }),
      tx({ status: 'Completed' }),
      tx({ status: 'Pending' }),
      tx({ status: 'Pending' }),
      tx({ status: 'Failed' }),
    ];
    assert.deepEqual(aggregateStatusCounts(list), { completed: 2, pending: 2, failed: 1 });
  });

  it('returns zeros for empty list', () => {
    assert.deepEqual(aggregateStatusCounts([]), { completed: 0, pending: 0, failed: 0 });
  });
});

// ---------------------------------------------------------------------------
//  aggregateRevenueByPeriod + bucketLabel
// ---------------------------------------------------------------------------
describe('bucketLabel', () => {
  it('formats yearly as YYYY', () => {
    assert.equal(bucketLabel('2026-03-15T10:00:00Z', 'yearly'), '2026');
  });

  it('formats monthly as YYYY-MM', () => {
    assert.equal(bucketLabel('2026-03-15T10:00:00Z', 'monthly'), '2026-03');
  });

  it('formats daily as YYYY-MM-DD', () => {
    assert.equal(bucketLabel('2026-03-15T10:00:00Z', 'daily'), '2026-03-15');
  });

  it('formats weekly as YYYY-Www', () => {
    // 2026-01-01 is a Thursday → week 1
    assert.equal(bucketLabel('2026-01-01T00:00:00Z', 'weekly'), '2026-W01');
    // 2026-01-05 is a Monday → week 2
    assert.equal(bucketLabel('2026-01-05T00:00:00Z', 'weekly'), '2026-W02');
  });
});

describe('aggregateRevenueByPeriod', () => {
  const NOW = new Date();
  const utcNow = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()));

  function pad2(n: number): string {
    return String(n).padStart(2, '0');
  }

  /** Build expected daily labels: from the most recent Sunday through today (UTC). */
  function dailyLabels(): string[] {
    const dayOfWeek = utcNow.getUTCDay(); // 0=Sun … 6=Sat
    const startDay = new Date(utcNow);
    startDay.setUTCDate(startDay.getUTCDate() - dayOfWeek); // go back to Sunday
    const labels: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDay);
      d.setUTCDate(d.getUTCDate() + i);
      labels.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`);
    }
    return labels;
  }

  /** Build expected monthly labels: last N months ending at the UTC month. */
  function monthlyLabels(count: number): string[] {
    const labels: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth() - i, 1));
      labels.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`);
    }
    return labels; // already oldest-first
  }

  /** Build expected yearly labels: last N years. */
  function yearlyLabels(count: number): string[] {
    const labels: string[] = [];
    for (let i = count - 1; i >= 0; i--) {
      labels.push(String(utcNow.getUTCFullYear() - i));
    }
    return labels; // already oldest-first
  }

  // ---- Basic cases ----

  it('returns empty for no transactions', () => {
    assert.deepEqual(aggregateRevenueByPeriod([], 'monthly'), []);
  });

  it('returns empty when no completed transactions exist', () => {
    const list = [tx({ status: 'Pending' }), tx({ status: 'Failed' })];
    assert.deepEqual(aggregateRevenueByPeriod(list, 'monthly'), []);
  });

  // ---- Bucket count / range ----

  it('daily returns exactly 7 chronological buckets', () => {
    const list = [tx({ amount: 50, timestamp: utcNow.toISOString(), status: 'Completed' })];
    const result = aggregateRevenueByPeriod(list, 'daily');
    assert.equal(result.length, 7);
    assert.deepEqual(
      result.map((r) => r.label),
      dailyLabels(),
    );
  });

  it('weekly returns exactly 12 chronological buckets', () => {
    const list = [tx({ amount: 50, timestamp: utcNow.toISOString(), status: 'Completed' })];
    const result = aggregateRevenueByPeriod(list, 'weekly');
    assert.equal(result.length, 12);
  });

  it('monthly returns exactly 12 chronological buckets', () => {
    const list = [tx({ amount: 50, timestamp: utcNow.toISOString(), status: 'Completed' })];
    const result = aggregateRevenueByPeriod(list, 'monthly');
    assert.equal(result.length, 12);
    assert.deepEqual(
      result.map((r) => r.label),
      monthlyLabels(12),
    );
  });

  it('yearly returns exactly 5 chronological buckets', () => {
    const list = [tx({ amount: 50, timestamp: utcNow.toISOString(), status: 'Completed' })];
    const result = aggregateRevenueByPeriod(list, 'yearly');
    assert.equal(result.length, 5);
    assert.deepEqual(
      result.map((r) => r.label),
      yearlyLabels(5),
    );
  });

  // ---- Status filtering ----

  it('Completed transactions are included', () => {
    const list = [tx({ amount: 100, timestamp: utcNow.toISOString(), status: 'Completed' })];
    const result = aggregateRevenueByPeriod(list, 'monthly');
    const currentMonth = monthlyLabels(12)[11]; // newest (last) label
    const bucket = result.find((r) => r.label === currentMonth);
    assert.ok(bucket);
    assert.equal(bucket!.value, 100);
  });

  it('Pending transactions are excluded', () => {
    const list = [tx({ amount: 100, timestamp: utcNow.toISOString(), status: 'Pending' })];
    const result = aggregateRevenueByPeriod(list, 'monthly');
    // All values must be 0 since no Completed transaction exists.
    assert.ok(result.every((r) => r.value === 0));
  });

  it('Failed transactions are excluded', () => {
    const list = [tx({ amount: 100, timestamp: utcNow.toISOString(), status: 'Failed' })];
    const result = aggregateRevenueByPeriod(list, 'monthly');
    assert.ok(result.every((r) => r.value === 0));
  });

  // ---- Summation ----

  it('multiple transactions in the same period are summed', () => {
    const currentMonth = monthlyLabels(12)[11];
    const list = [
      tx({ amount: 100, timestamp: utcNow.toISOString(), status: 'Completed' }),
      tx({ amount: 200, timestamp: utcNow.toISOString(), status: 'Completed' }),
    ];
    const result = aggregateRevenueByPeriod(list, 'monthly');
    const bucket = result.find((r) => r.label === currentMonth);
    assert.equal(bucket!.value, 300);
  });

  // ---- Chronological order ----

  it('results are sorted chronologically (oldest first)', () => {
    const list = [tx({ amount: 50, timestamp: utcNow.toISOString(), status: 'Completed' })];
    const result = aggregateRevenueByPeriod(list, 'monthly');
    const labels = result.map((r) => r.label);
    // Verify strict chronological order by comparing string-sorted vs result order.
    const sorted = [...labels].sort();
    assert.deepEqual(labels, sorted);
  });

  // ---- Empty periods ----

  it('empty periods are represented with value 0', () => {
    // Place a completed transaction 3 months ago — the other 11 months should be 0.
    const threeMonthsAgo = new Date(Date.UTC(utcNow.getUTCFullYear(), utcNow.getUTCMonth() - 3, 15));
    const list = [tx({ amount: 500, timestamp: threeMonthsAgo.toISOString(), status: 'Completed' })];
    const result = aggregateRevenueByPeriod(list, 'monthly');
    assert.equal(result.length, 12);
    // The month 3 months ago should have the value; all others 0.
    const targetLabel = `${threeMonthsAgo.getUTCFullYear()}-${pad2(threeMonthsAgo.getUTCMonth() + 1)}`;
    for (const r of result) {
      if (r.label === targetLabel) {
        assert.equal(r.value, 500);
      } else {
        assert.equal(r.value, 0, `expected 0 for ${r.label}`);
      }
    }
  });

  // ---- Real-time update behavior ----

  it('a new transaction changes the correct bucket', () => {
    // Start with one transaction today, add another in the same period.
    const todayLabel = `${utcNow.getUTCFullYear()}-${pad2(utcNow.getUTCMonth() + 1)}-${pad2(utcNow.getUTCDate())}`;
    const list1 = [tx({ amount: 100, timestamp: utcNow.toISOString(), status: 'Completed' })];
    const result1 = aggregateRevenueByPeriod(list1, 'daily');
    const bucket1 = result1.find((r) => r.label === todayLabel);
    assert.equal(bucket1!.value, 100);

    // Add another transaction same day.
    const list2 = [
      tx({ amount: 100, timestamp: utcNow.toISOString(), status: 'Completed' }),
      tx({ amount: 50, timestamp: utcNow.toISOString(), status: 'Completed' }),
    ];
    const result2 = aggregateRevenueByPeriod(list2, 'daily');
    const bucket2 = result2.find((r) => r.label === todayLabel);
    assert.equal(bucket2!.value, 150);
  });

  // ---- No mutation ----

  it('does not mutate the original transaction array', () => {
    const list = [tx({ amount: 100, timestamp: utcNow.toISOString(), status: 'Completed' })];
    const original = [...list];
    aggregateRevenueByPeriod(list, 'monthly');
    assert.deepEqual(list, original);
  });

  // ---- Edge cases ----

  it('handles zero transactions gracefully', () => {
    assert.deepEqual(aggregateRevenueByPeriod([], 'daily'), []);
    assert.deepEqual(aggregateRevenueByPeriod([], 'weekly'), []);
    assert.deepEqual(aggregateRevenueByPeriod([], 'monthly'), []);
    assert.deepEqual(aggregateRevenueByPeriod([], 'yearly'), []);
  });

  it('handles only failed transactions', () => {
    const list = [tx({ amount: 100, timestamp: utcNow.toISOString(), status: 'Failed' })];
    assert.deepEqual(aggregateRevenueByPeriod(list, 'daily'), []);
  });

  it('handles only pending transactions', () => {
    const list = [tx({ amount: 100, timestamp: utcNow.toISOString(), status: 'Pending' })];
    assert.deepEqual(aggregateRevenueByPeriod(list, 'daily'), []);
  });

  it('handles one day of data correctly (today, with surrounding days at 0)', () => {
    const list = [tx({ amount: 100, timestamp: utcNow.toISOString(), status: 'Completed' })];
    const result = aggregateRevenueByPeriod(list, 'daily');
    assert.equal(result.length, 7);
    const total = result.reduce((s, r) => s + r.value, 0);
    assert.equal(total, 100); // only one day has non-zero
    // Today's bucket must be the one with the value.
    const todayLabel = `${utcNow.getUTCFullYear()}-${pad2(utcNow.getUTCMonth() + 1)}-${pad2(utcNow.getUTCDate())}`;
    const todayBucket = result.find((r) => r.label === todayLabel);
    assert.equal(todayBucket!.value, 100);
  });
});

// ---------------------------------------------------------------------------
//  aggregateCurrencyStatus
// ---------------------------------------------------------------------------
describe('aggregateCurrencyStatus', () => {
  it('returns empty for empty input', () => {
    assert.deepEqual(aggregateCurrencyStatus([]), []);
  });

  it('groups amounts by currency and status', () => {
    const list = [
      tx({ amount: 100, currency: 'USD', status: 'Completed' }),
      tx({ amount: 50, currency: 'USD', status: 'Completed' }),
      tx({ amount: 30, currency: 'USD', status: 'Pending' }),
      tx({ amount: 20, currency: 'ILS', status: 'Failed' }),
      tx({ amount: 200, currency: 'EUR', status: 'Completed' }),
    ];
    const result = aggregateCurrencyStatus(list);
    assert.equal(result.length, 3);

    const usd = result.find((r) => r.currency === 'USD')!;
    assert.equal(usd.completed, 150);
    assert.equal(usd.pending, 30);
    assert.equal(usd.failed, 0);

    const ils = result.find((r) => r.currency === 'ILS')!;
    assert.equal(ils.completed, 0);
    assert.equal(ils.pending, 0);
    assert.equal(ils.failed, 20);

    const eur = result.find((r) => r.currency === 'EUR')!;
    assert.equal(eur.completed, 200);
  });

  it('sorts alphabetically by currency', () => {
    const list = [
      tx({ currency: 'USD', status: 'Completed' }),
      tx({ currency: 'ILS', status: 'Completed' }),
      tx({ currency: 'EUR', status: 'Completed' }),
    ];
    const result = aggregateCurrencyStatus(list);
    assert.deepEqual(
      result.map((r) => r.currency),
      ['EUR', 'ILS', 'USD'],
    );
  });

  it('handles single-currency data', () => {
    const list = [
      tx({ currency: 'USD', status: 'Completed' }),
      tx({ currency: 'USD', status: 'Pending' }),
    ];
    const result = aggregateCurrencyStatus(list);
    assert.equal(result.length, 1);
    assert.equal(result[0].currency, 'USD');
  });

  it('handles numeric-status payloads via normalizeStatus', () => {
    // Simulate raw data from server that arrives as numeric enum (0/1/2).
    const list = [
      { transactionId: crypto.randomUUID(), amount: 100, currency: 'USD', status: 0 as unknown as Transaction['status'], timestamp: '2026-08-21T12:00:00+00:00' },
      { transactionId: crypto.randomUUID(), amount: 200, currency: 'USD', status: 1 as unknown as Transaction['status'], timestamp: '2026-08-21T12:00:00+00:00' },
      { transactionId: crypto.randomUUID(), amount: 50, currency: 'USD', status: 2 as unknown as Transaction['status'], timestamp: '2026-08-21T12:00:00+00:00' },
    ];
    // Does NOT crash, and correctly classifies.
    const k = aggregateKpis(list as Transaction[]);
    assert.equal(k.completed, 1, 'status=1 → completed');
    assert.equal(k.failed, 1, 'status=2 → failed');
    assert.equal(k.pending, 1, 'status=0 → pending');
    assert.equal(k.completedRevenue['USD'], 200);
    assert.equal(k.successRate, 50); // 1/(1+1)*100

    const byStatus = aggregateStatusCounts(list as Transaction[]);
    assert.deepEqual(byStatus, { completed: 1, pending: 1, failed: 1 });

    const byCurrency = aggregateCurrencyStatus(list as Transaction[]);
    assert.equal(byCurrency.length, 1);
    assert.equal(byCurrency[0].completed, 200);
    assert.equal(byCurrency[0].failed, 50);
  });
});
