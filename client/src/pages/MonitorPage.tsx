import { useMemo, useState } from 'react';
import { ErrorFilterToggle } from '../components/ErrorFilterToggle';
import { TransactionCard } from '../components/TransactionCard';
import { TransactionDashboard } from '../components/TransactionDashboard';
import { TransactionTable } from '../components/TransactionTable';
import { ViewToggle, type ViewMode } from '../components/ViewToggle';
import { useLiveTransactions } from '../hooks/useLiveTransactions';
import { useTransactionToast } from '../components/TransactionToast';

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
  const { addToast, ToastContainer } = useTransactionToast();
  const { transactions, totalCount, connectionState, filter, toggleFailedOnly } =
    useLiveTransactions(addToast);
  const errorsOnly = filter === 'failed';
  const [view, setView] = useState<ViewMode>('table');

  /** Status filter shared between table and dashboard views. */
  const [statusFilter, setStatusFilter] = useState<string>('All');

  /** Dashboard receives filtered data when a status filter is active. */
  const dashboardTransactions = useMemo(() => {
    if (statusFilter === 'All') return transactions;
    return transactions.filter((tx) => tx.status === statusFilter);
  }, [transactions, statusFilter]);

  return (
    <section className="page">
      <ToastContainer />
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

      {view === 'dashboard' ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pill-filter"
              aria-label="Filter by status"
            >
              <option value="All">All</option>
              <option value="Pending">Pending</option>
              <option value="Completed">Completed</option>
              <option value="Failed">Failed</option>
            </select>
            <span className="text-xs font-medium text-[var(--muted)]">
              {dashboardTransactions.length} transaction{dashboardTransactions.length === 1 ? '' : 's'} visible
            </span>
          </div>
          <TransactionDashboard transactions={dashboardTransactions} />
        </>
      ) : view === 'cards' ? (
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
        <TransactionTable transactions={transactions} statusFilter={statusFilter} onStatusFilterChange={setStatusFilter} />
      )}
    </section>
  );
}
