import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyStatusFilter, sortNewestFirst, type FeedFilter } from '../src/services/liveData.ts';
import { normalizeStatus, type DisplayStatus } from '../src/services/status.ts';
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

  // A numeric enum index carries the same meaning as its string. With the
  // runtime normalizer wired in, `status: 2` (Failed in the C# enum) MUST be
  // included in the failed-only filter — so a rogue index no longer hides a
  // Failed transaction from the errors view.
  it("'failed' also matches the numeric enum index 2 (Failed) — no index slips through", () => {
    const numericStatus = { ...tx({ status: 'Failed' }), status: 2 as unknown } as unknown as Transaction;
    const out = applyStatusFilter([numericStatus], 'failed');
    assert.equal(out.length, 1);
  });
});

describe('normalizeStatus', () => {
  it('maps canonical PascalCase strings to their lowercase display key', () => {
    assert.equal(normalizeStatus('Failed'), 'failed');
    assert.equal(normalizeStatus('Completed'), 'completed');
    assert.equal(normalizeStatus('Pending'), 'pending');
  });

  it('is case-insensitive and trims surrounding whitespace', () => {
    assert.equal(normalizeStatus('  FAILED  '), 'failed');
    assert.equal(normalizeStatus('failed'), 'failed');
  });

  it('maps numeric enum index 2 to failed (0/1/2 → pending/completed/failed)', () => {
    assert.equal(normalizeStatus(2 as unknown), 'failed');
    assert.equal(normalizeStatus(1 as unknown), 'completed');
    assert.equal(normalizeStatus(0 as unknown), 'pending');
  });

  it('falls back to unknown for undefined, objects, or out-of-range values', () => {
    assert.equal(normalizeStatus(undefined), 'unknown');
    assert.equal(normalizeStatus(null), 'unknown');
    assert.equal(normalizeStatus(99 as unknown), 'unknown');
    assert.equal(normalizeStatus({} as unknown), 'unknown');
  });

  it('never crashes on any inbound shape (regression: .toLowerCase is not a function)', () => {
    const hostile: unknown[] = [2, undefined, null, {}, [], 'GARBAGE', ''];
    for (const value of hostile) {
      const key = normalizeStatus(value);
      assert.ok((['pending', 'completed', 'failed', 'unknown'] as DisplayStatus[]).includes(key));
    }
  });
});
