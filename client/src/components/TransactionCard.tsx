import type { Transaction } from '../types/transaction';
import { StatusBadge } from './StatusBadge';

/** Format a UTC ISO timestamp into a readable local date+time string. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Single row/tile of a transaction: id (short), amount + currency,
 * timestamp and a status badge. Used by the live monitor feed. When `fresh`,
 * the card gets a one-off "new item" glow on mount.
 */
export function TransactionCard({
  transaction,
  fresh = false,
}: {
  transaction: Transaction;
  fresh?: boolean;
}) {
  return (
    <article className={fresh ? 'tx-card tx-card--fresh' : 'tx-card'}>
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
