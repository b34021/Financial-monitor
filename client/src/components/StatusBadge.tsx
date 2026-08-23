import { STATUS_MAP, normalizeStatus } from '../services/status';

/**
 * Renders a transaction's lifecycle status as a color-coded pill (badge).
 * Completed = green, Pending = amber, Failed = red, anything unexpected =
 * neutral gray. Input is normalized at runtime so a non-string status (numeric
 * enum index, `undefined`, odd casing) can never crash the render path.
 */
export function StatusBadge({ status }: { status: unknown }) {
  const key = normalizeStatus(status);
  const palette = STATUS_MAP[key];

  return (
    <span className={`badge ${palette.badge}`} aria-label={`Status: ${palette.label}`}>
      <span className="badge__dot" aria-hidden="true" />
      {palette.label}
    </span>
  );
}
