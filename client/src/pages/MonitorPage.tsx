import { ErrorFilterToggle } from '../components/ErrorFilterToggle';
import { TransactionCard } from '../components/TransactionCard';
import { useLiveTransactions } from '../hooks/useLiveTransactions';

/**
 * /monitor — live dashboard. Dehydrated of all network/state logic: it calls
 * useLiveTransactions (SignalR connect/history/live/cap/filter) and renders the
 * resulting list. No direct fetch, no try/catch, no local connection handling.
 */
export function MonitorPage() {
  const { transactions, totalCount, connectionState, filter, toggleFailedOnly } =
    useLiveTransactions();
  const errorsOnly = filter === 'failed';

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
          <ErrorFilterToggle checked={errorsOnly} onToggle={toggleFailedOnly} />
          <span className={`pill pill--${connectionState}`}>
            {connectionState === 'connecting' && 'Connecting…'}
            {connectionState === 'connected' && 'Connected (live)'}
            {connectionState === 'failed' && 'Connection failed'}
          </span>
        </div>
      </div>

      {transactions.length === 0 ? (
        <p className="page__empty">
          {errorsOnly
            ? 'No failed transactions to show.'
            : 'No transactions yet. Send one from the /add simulator.'}
        </p>
      ) : (
        <div className="tx-feed">
          {transactions.map((tx, index) => (
            <TransactionCard key={tx.transactionId} transaction={tx} fresh={index === 0} />
          ))}
        </div>
      )}
    </section>
  );
}
