import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { aggregateCurrencyStatus } from '../services/aggregations';
import type { Transaction } from '../types/transaction';

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

interface CurrencyStatusChartProps {
  transactions: Transaction[];
}

export function CurrencyStatusChart({ transactions }: CurrencyStatusChartProps) {
  const data = useMemo(() => aggregateCurrencyStatus(transactions), [transactions]);

  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p>No transactions yet.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">Currency × status (amounts)</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="currency"
            tick={{ fontSize: 12, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            width={50}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
            }}
            formatter={(value, name) => {
              const n = typeof value === 'number' ? value : 0;
              const label = String(name ?? '');
              return [n.toLocaleString(), SLICE_LABELS[label] ?? label];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value: string) => SLICE_LABELS[value] ?? value}
          />
          <Bar
            dataKey="completed"
            stackId="a"
            fill={SLICE_COLORS.completed}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="pending"
            stackId="a"
            fill={SLICE_COLORS.pending}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="failed"
            stackId="a"
            fill={SLICE_COLORS.failed}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
