import type { TransactionStatus } from '../types/transaction';

/**
 * Renders a transaction's lifecycle status as a color-coded pill (badge).
 * Pending = amber (in flight), Completed = green, Failed = red. A small dot
 * echoes the status colour for quick scanning; the text label is the readable
 * status name.
 */
const STATUS_PALETTE: Record<TransactionStatus, string> = {
  Pending: 'badge--pending',
  Completed: 'badge--completed',
  Failed: 'badge--failed',
};

export function StatusBadge({ status }: { status: TransactionStatus }) {
  return (
    <span className={`badge ${STATUS_PALETTE[status]}`} aria-label={`Status: ${status}`}>
      <span className="badge__dot" aria-hidden="true" />
      {status}
    </span>
  );
}
