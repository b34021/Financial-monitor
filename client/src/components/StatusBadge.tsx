import type { TransactionStatus } from '../types/transaction';

/**
 * Renders a transaction's lifecycle status as a small, color-coded badge.
 * Pending = amber (in flight), Completed = green, Failed = red.
 */
export function StatusBadge({ status }: { status: TransactionStatus }) {
  const label = status;
  const className =
    status === 'Pending'
      ? 'badge badge--pending'
      : status === 'Completed'
        ? 'badge badge--completed'
        : 'badge badge--failed';

  return <span className={className}>{label}</span>;
}
