import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyStatusFilter, sortNewestFirst, type FeedFilter } from '../src/services/liveData.ts';
import type { Transaction } from '../src/types/transaction.ts';

/**
 * Unit tests for the pure feed helpers in `src/services/liveData.ts` — the
 * sort + filter logic that backs useLiveTransactions. Plain Node test runner
 * (no extra tooling), since these functions are I/O-free and side-effect-free.
 */

const NEWER = '2026-08-23T12:00:00+00:00';
const OLDER = '2026-08-23T11:00:00+00:00';

function tx(overrides: Partial<Transaction> & { status: Transaction['status'] }): Transaction {
  return {
    transactionId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    amount: 100,
    currency: 'USD',
    timestamp: NEWER,
    ...overrides,
  };
}

describe('sortNewestFirst', () => {
  it('orders newest timestamp first', () => {
    const newer = tx({ transactionId: 'b', timestamp: NEWER, status: 'Pending' });
    const older = tx({ transactionId: 'a', timestamp: OLDER, status: 'Pending' });
    assert.deepEqual(
      sortNewestFirst([older, newer]).map((t) => t.transactionId),
      ['b', 'a'],
    );
  });

  it('does not mutate the input list', () => {
    const input = [tx({ status: 'Pending' })];
    sortNewestFirst(input);
    assert.equal(input.length, 1);
  });
});

describe('applyStatusFilter', () => {
  const pending = tx({ transactionId: 'p', status: 'Pending' });
  const completed = tx({ transactionId: 'c', status: 'Completed' });
  const failed = tx({ transactionId: 'f', status: 'Failed' });
  const all = [pending, completed, failed];

  it("'all' returns every transaction in the same order", () => {
    assert.deepEqual(
      applyStatusFilter(all, 'all').map((t) => t.transactionId),
      ['p', 'c', 'f'],
    );
  });

  it("'failed' narrows to Failed transactions only", () => {
    assert.deepEqual(
      applyStatusFilter(all, 'failed').map((t) => t.transactionId),
      ['f'],
    );
  });

  it('returns a fresh array (never the caller reference)', () => {
    const out = applyStatusFilter(all, 'all');
    assert.notEqual(out, all);
  });

  it('matches the FeedFilter union exhaustively', () => {
    const filters: FeedFilter[] = ['all', 'failed'];
    for (const f of filters) {
      assert.ok(Array.isArray(applyStatusFilter(all, f)));
    }
  });
});
