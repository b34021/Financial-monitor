import { useEffect, useRef, useState } from 'react';
import { TransactionHubClient } from '../services/signalR';
import type { Transaction } from '../types/transaction';

/** Hard cap on the buffered list — keeps the feed light no matter the volume. */
const MAX_TRANSACTIONS = 200;

export type ConnectionState = 'connecting' | 'connected' | 'failed';

/**
 * useLiveTransactions — owns the live feed's state and SignalR connection.
 *
 * Responsibilities split away from the page:
 *   - connects to the hub on mount, disposes on unmount (cleanup via ref);
 *   - seeds the list from the cache-backed history (InitialTransactions);
 *   - prepends each incoming transaction, newest-first, capped at MAX;
 *   - sorts by timestamp (desc) so ordering survives out-of-order delivery;
 *   - exposes a "show only errors" filter that narrows the exposed list;
 *   - exposes the connection state for the status pill.
 *
 * The page renders whatever this returns — it holds no network logic itself.
 */
export function useLiveTransactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showOnlyFailed, setShowOnlyFailed] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const clientRef = useRef<TransactionHubClient | null>(null);

  useEffect(() => {
    let disposed = false;

    const client = new TransactionHubClient({
      onInitialTransactions: (history) => {
        if (disposed) return;
        setTransactions(sortNewestFirst(history).slice(0, MAX_TRANSACTIONS));
        setConnectionState('connected');
      },
      onTransactionReceived: (tx) => {
        if (disposed) return;
        // Functional update — only the new head is added, the rest is intact.
        setTransactions((prev) => sortNewestFirst([tx, ...prev]).slice(0, MAX_TRANSACTIONS));
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

  const visible = showOnlyFailed
    ? transactions.filter((tx) => tx.status === 'Failed')
    : transactions;

  const toggleFailedOnly = () => setShowOnlyFailed((prev) => !prev);

  return {
    transactions: visible,
    totalCount: transactions.length,
    connectionState,
    showOnlyFailed,
    toggleFailedOnly,
  };
}

/** Sort newest-first by the timestamp (events may arrive out of order). */
function sortNewestFirst(list: Transaction[]): Transaction[] {
  return list
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
