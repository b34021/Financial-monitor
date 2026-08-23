import type { Transaction } from '../types/transaction';
import { STATUS_MAP, normalizeStatus } from '../services/status';
import { StatusBadge } from './StatusBadge';

/** Format a UTC ISO timestamp into a readable local date+time string. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Single row/tile of a transaction: id (short), amount + currency,
 * timestamp and a status badge. Used by the live monitor feed. When `fresh`,
 * the card gets a one-off "new item" glow on mount; `enterDelay` staggers the
 * entrance animation so a burst of new cards cascades in gracefully.
 */
export function TransactionCard({
  transaction,
  fresh = false,
  enterDelay = 0,
}: {
  transaction: Transaction;
  fresh?: boolean;
  enterDelay?: number;
}) {
  // Normalize at render so a non-string status (numeric index, undefined,
  // odd casing) falls back safely instead of crashing .toLowerCase().
  const statusKey = normalizeStatus(transaction.status);
  const statusClass = STATUS_MAP[statusKey].card;
  const className = fresh
    ? `tx-card ${statusClass} tx-card--fresh`
    : `tx-card ${statusClass}`;

  return (
    <article className={className} style={enterDelay ? { animationDelay: `${enterDelay}ms` } : undefined}>
      <div className="tx-card__top">
        <span className="tx-card__id" title={transaction.transactionId}>
          {transaction.transactionId.slice(0, 8)}…
        </span>
        <StatusBadge status={transaction.status} />
      </div>
      <div className="tx-card__amount">
        {transaction.amount.toLocaleString()} <span className="tx-card__currency">{transaction.currency}</span>
      </div>
      <div className="tx-card__ts">{formatTimestamp(transaction.timestamp)}</div>
    </article>
  );
}
