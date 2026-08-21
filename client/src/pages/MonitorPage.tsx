import { useEffect, useRef, useState } from 'react';
import { TransactionCard } from '../components/TransactionCard';
import { TransactionHubClient } from '../services/signalR';
import type { Transaction } from '../types/transaction';

/**
 * /monitor — live dashboard. On mount it connects to the SignalR hub, receives
 * the cache-backed history immediately ("InitialTransactions") and then appends
 * each freshly-ingested transaction ("TransactionReceived"), newest first.
 */
export function MonitorPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const clientRef = useRef<TransactionHubClient | null>(null);

  useEffect(() => {
    let disposed = false;

    const client = new TransactionHubClient({
      onInitialTransactions: (history) => {
        if (disposed) return;
        setTransactions(history);
        setConnectionState('connected');
      },
      onTransactionReceived: (tx) => {
        if (disposed) return;
        // Newest first; keep an internal buffer cap so the list stays light.
        setTransactions((prev) => [tx, ...prev].slice(0, 200));
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

  return (
    <section className="page">
      <div className="page__header">
        <h2>Live dashboard</h2>
        <span className={`pill pill--${connectionState}`}>
          {connectionState === 'connecting' && 'Connecting…'}
          {connectionState === 'connected' && 'Connected (live)'}
          {connectionState === 'failed' && 'Connection failed'}
        </span>
      </div>

      {transactions.length === 0 ? (
        <p className="page__empty">No transactions yet. Send one from the /add simulator.</p>
      ) : (
        <div className="tx-feed">
          {transactions.map((tx) => (
            <TransactionCard key={tx.transactionId} transaction={tx} />
          ))}
        </div>
      )}
    </section>
  );
}
