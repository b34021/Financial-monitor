import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { aggregateRevenueByPeriod } from '../services/aggregations';
import type { Transaction } from '../types/transaction';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

interface RevenueTrendChartProps {
  transactions: Transaction[];
}

export function RevenueTrendChart({ transactions }: RevenueTrendChartProps) {
  const [period, setPeriod] = useState<Period>('monthly');

  const data = useMemo(
    () => aggregateRevenueByPeriod(transactions, period),
    [transactions, period],
  );

  if (data.length === 0) {
    return (
      <div className="chart-empty">
        <p>No completed transactions yet.</p>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <div className="chart-title-row">
        <h3 className="chart-title">Revenue trend</h3>
        <div className="period-toggle">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`period-toggle__btn${period === p.key ? ' period-toggle__btn--active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="chart-disclaimer">
        Revenue shown in raw amounts per period. For per-currency breakdown use the Currency Status table.
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            width={60}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--accent)' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
