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
  it('returns empty for no transactions', () => {
    assert.deepEqual(aggregateRevenueByPeriod([], 'monthly'), []);
  });

  it('returns empty when no completed transactions exist', () => {
    const list = [tx({ status: 'Pending' }), tx({ status: 'Failed' })];
    assert.deepEqual(aggregateRevenueByPeriod(list, 'monthly'), []);
  });

  it('groups completed revenue daily', () => {
    const list = [
      tx({ amount: 100, timestamp: '2026-08-21T10:00:00Z', status: 'Completed' }),
      tx({ amount: 50, timestamp: '2026-08-21T14:00:00Z', status: 'Completed' }),
      tx({ amount: 200, timestamp: '2026-08-22T08:00:00Z', status: 'Completed' }),
    ];
    const result = aggregateRevenueByPeriod(list, 'daily');
    assert.equal(result.length, 2);
    assert.equal(result[0].label, '2026-08-21');
    assert.equal(result[0].value, 150);
    assert.equal(result[1].label, '2026-08-22');
    assert.equal(result[1].value, 200);
  });

  it('groups completed revenue yearly', () => {
    const list = [
      tx({ amount: 100, timestamp: '2025-06-01T00:00:00Z', status: 'Completed' }),
      tx({ amount: 200, timestamp: '2026-01-01T00:00:00Z', status: 'Completed' }),
    ];
    const result = aggregateRevenueByPeriod(list, 'yearly');
    assert.equal(result.length, 2);
    assert.equal(result[0].label, '2025');
    assert.equal(result[0].value, 100);
    assert.equal(result[1].label, '2026');
    assert.equal(result[1].value, 200);
  });

  it('sorts buckets chronologically', () => {
    const list = [
      tx({ amount: 50, timestamp: '2026-08-22T00:00:00Z', status: 'Completed' }),
      tx({ amount: 100, timestamp: '2026-08-21T00:00:00Z', status: 'Completed' }),
    ];
    const result = aggregateRevenueByPeriod(list, 'daily');
    assert.equal(result[0].label, '2026-08-21');
    assert.equal(result[1].label, '2026-08-22');
  });

  it('does not include Pending or Failed transactions', () => {
    const list = [
      tx({ amount: 999, timestamp: '2026-08-21T00:00:00Z', status: 'Pending' }),
      tx({ amount: 999, timestamp: '2026-08-21T00:00:00Z', status: 'Failed' }),
      tx({ amount: 50, timestamp: '2026-08-21T00:00:00Z', status: 'Completed' }),
    ];
    const result = aggregateRevenueByPeriod(list, 'daily');
    assert.equal(result.length, 1);
    assert.equal(result[0].value, 50);
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
