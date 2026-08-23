import { useState } from 'react';
import { ErrorFilterToggle } from '../components/ErrorFilterToggle';
import { TransactionCard } from '../components/TransactionCard';
import { TransactionTable } from '../components/TransactionTable';
import { ViewToggle, type ViewMode } from '../components/ViewToggle';
import { useLiveTransactions } from '../hooks/useLiveTransactions';

/** Entrance stagger: only the first few cards cascade, so a burst of >STAGGER_GAP
 *  cards still animates in smoothly without stalling the whole 200-item feed. */
const STAGGER_GAP = 8;
const STAGGER_STEP = 40;

/**
 * /monitor — live dashboard. Dehydrated of all network/state logic: it calls
 * useLiveTransactions (SignalR connect/history/live/cap/filter) and renders the
 * resulting list. No direct fetch, no try/catch, no local connection handling.
 */
export function MonitorPage() {
  const { transactions, totalCount, connectionState, filter, toggleFailedOnly } =
    useLiveTransactions();
  const errorsOnly = filter === 'failed';
  const [view, setView] = useState<ViewMode>('table');

  return (
    <section className="page">
      <div className="page__header">
        <div>
          <h2>Live dashboard</h2>
          <p className="page__hint">
            {totalCount} transaction{totalCount === 1 ? '' : 's'} visible
            {errorsOnly ? ' (errors only)' : ''}.
          </p>
        </div>
        <div className="page__header-actions">
          <ViewToggle view={view} onViewChange={setView} />
          <ErrorFilterToggle filtered={errorsOnly} onToggle={toggleFailedOnly} />
          <span className={`pill pill--${connectionState}`}>
            {connectionState === 'connecting' && 'Connecting…'}
            {connectionState === 'connected' && 'Connected (live)'}
            {connectionState === 'failed' && 'Connection failed'}
          </span>
        </div>
      </div>

      {view === 'cards' ? (
        transactions.length === 0 ? (
          <p className="page__empty">
            {errorsOnly
              ? 'No failed transactions to show.'
              : 'No transactions yet. Send one from the /add simulator.'}
          </p>
        ) : (
          <div className="tx-feed">
            {transactions.map((tx, index) => (
              <TransactionCard
                key={tx.transactionId}
                transaction={tx}
                fresh={index === 0}
                enterDelay={index < STAGGER_GAP ? index * STAGGER_STEP : 0}
              />
            ))}
          </div>
        )
      ) : (
        <TransactionTable transactions={transactions} />
      )}
    </section>
  );
}
