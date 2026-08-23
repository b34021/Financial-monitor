import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import { aggregateStatusCounts } from '../services/aggregations';
import type { Transaction } from '../types/transaction';

interface StatusPieChartProps {
  transactions: Transaction[];
}

/** Colour palette matching the CSS StatusBadge tokens. */
const SLICE_COLORS: Record<string, string> = {
  completed: '#1d9d5d',
  pending: '#d98324',
  failed: '#d54040',
};

const SLICE_LABELS: Record<string, string> = {
  completed: 'Completed',
  pending: 'Pending',
  failed: 'Failed',
};

export function StatusPieChart({ transactions }: StatusPieChartProps) {
  const counts = useMemo(() => aggregateStatusCounts(transactions), [transactions]);
  const total = counts.completed + counts.pending + counts.failed;

  const data = useMemo(
    () =>
      (
        [
          { name: 'completed', value: counts.completed },
          { name: 'pending', value: counts.pending },
          { name: 'failed', value: counts.failed },
        ] as const
      ).filter((d) => d.value > 0),
    [counts],
  );

  if (total === 0) {
    return (
      <div className="chart-empty">
        <p>No data yet</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">Status breakdown</h3>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            dataKey="value"
            nameKey="name"
          >
            {data.map((entry) => (
              <Cell key={entry.name} fill={SLICE_COLORS[entry.name] ?? '#888'} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        {data.map((entry) => {
          const pct = ((entry.value / total) * 100).toFixed(1);
          return (
            <span key={entry.name} className="chart-legend__item">
              <span
                className="chart-legend__dot"
                style={{ background: SLICE_COLORS[entry.name] ?? '#888' }}
              />
              {SLICE_LABELS[entry.name] ?? entry.name}: {entry.value} ({pct}%)
            </span>
          );
        })}
      </div>
    </div>
  );
}
