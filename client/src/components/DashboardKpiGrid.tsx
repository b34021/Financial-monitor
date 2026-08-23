import { useMemo } from 'react';
import { aggregateKpis } from '../services/aggregations';
import type { Transaction } from '../types/transaction';

interface DashboardKpiGridProps {
  transactions: Transaction[];
}

/**
 * Four KPI cards rendered from the live transaction window.
 * Data is re-derived on every render via aggregateKpis (O(n), memoised by
 * the parent's transaction reference identity).
 */
export function DashboardKpiGrid({ transactions }: DashboardKpiGridProps) {
  const kpi = useMemo(() => aggregateKpis(transactions), [transactions]);

  /** Format a currency-specific revenue string for display. */
  const revenueEntries = Object.entries(kpi.completedRevenue);

  return (
    <div className="kpi-grid">
      <KpiCard
        label="Total transactions"
        value={kpi.total.toLocaleString()}
        accent="var(--accent)"
      />
      <KpiCard
        label="Completed revenue"
        value={
          revenueEntries.length === 0
            ? '—'
            : revenueEntries
                .map(([ccy, amt]) => `${amt.toLocaleString()} ${ccy}`)
                .join(' · ')
        }
        accent="var(--ok)"
      />
      <KpiCard
        label="Success rate"
        value={`${kpi.successRate.toFixed(1)}%`}
        accent={kpi.successRate >= 90 ? 'var(--ok)' : kpi.successRate >= 50 ? 'var(--warn)' : 'var(--bad)'}
      />
      <KpiCard
        label="Failed"
        value={kpi.failed.toLocaleString()}
        accent="var(--bad)"
      />
    </div>
  );
}

// ── Internal card sub-component ────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  accent: string;
}

function KpiCard({ label, value, accent }: KpiCardProps) {
  return (
    <div
      className="kpi-card"
      style={
        { '--kpi-accent': accent } as React.CSSProperties
      }
    >
      <span className="kpi-card__label">{label}</span>
      <span className="kpi-card__value">{value}</span>
      <div className="kpi-card__bar" />
    </div>
  );
}
