import { useEffect, useRef, useState } from 'react';
import { TransactionHubClient } from '../services/signalR';
import { applyStatusFilter, sortNewestFirst, type FeedFilter } from '../services/liveData';
import type { Transaction } from '../types/transaction';

/** Hard cap on the buffered list — keeps the feed light no matter the volume. */
const MAX_TRANSACTIONS = 200;

export type ConnectionState = 'connecting' | 'connected' | 'failed';

/**
 * useLiveTransactions — owns the live feed's state and the SignalR connection.
 *
 * State is deliberately split so the page never conflates what was received
 * with what is shown:
 *   - `fullList`   — every received transaction (all statuses, capped, newest-first).
 *   - `filter`     — 'all' | 'failed' (which slice the dashboard shows).
 *   - `visibleList`— derived from (fullList, filter); what feeds the UI.
 *   - `totalCount` — ALWAYS the visible length, so the counter matches the
 *                    rendered list even while the error filter is active.
 *
 * Every new TransactionReceived lands in fullList regardless of the active
 * filter; Failed ones additionally appear in the visible slice when filtered.
 */
export function useLiveTransactions() {
  const [fullList, setFullList] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const clientRef = useRef<TransactionHubClient | null>(null);

  useEffect(() => {
    let disposed = false;

    const client = new TransactionHubClient({
      onInitialTransactions: (history) => {
        if (disposed) return;
        setFullList(sortNewestFirst(history).slice(0, MAX_TRANSACTIONS));
        setConnectionState('connected');
      },
      onTransactionReceived: (tx) => {
        if (disposed) return;
        // Functional update — prepend the new head, keep the rest intact,
        // re-sort, and stay within the buffer cap.
        setFullList((prev) => sortNewestFirst([tx, ...prev]).slice(0, MAX_TRANSACTIONS));
      },
    });
    clientRef.current = client;

    client.start().catch(() => {
      if (!disposed) setConnectionState('failed');
    });

    return () => {
      disposed = true;
      void client.dispose();
      clientRef.current = null;
    };
  }, []);

  const visibleList = applyStatusFilter(fullList, filter);
  const toggleFailedOnly = () => setFilter((prev) => (prev === 'failed' ? 'all' : 'failed'));

  return {
    transactions: visibleList,
    fullCount: fullList.length,
    totalCount: visibleList.length,
    filter,
    toggleFailedOnly,
    connectionState,
  };
}
