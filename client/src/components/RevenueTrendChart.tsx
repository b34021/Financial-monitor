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

// ---------------------------------------------------------------------------
//  Helpers — turn machine labels into human-readable X-axis / tooltip strings.
// ---------------------------------------------------------------------------

/** Format a raw bucket label for X-axis display (compact). */
function formatAxisLabel(label: string, period: Period): string {
  switch (period) {
    case 'daily': {
      // "2026-08-21" → "21" or "Mon 21" — use weekday abbreviation.
      const d = parseDaily(label);
      if (!d) return label;
      return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
    }
    case 'weekly': {
      // "2026-W34" → "W34"
      const match = label.match(/^(\d{4})-W(\d{2})$/);
      if (!match) return label;
      return `W${match[2]}`;
    }
    case 'monthly': {
      // "2026-08" → "Aug"
      const d = parseMonthly(label);
      if (!d) return label;
      return d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    }
    case 'yearly':
      return label; // "2026" — already fine
  }
}

/** Format a raw bucket label for tooltip display (verbose). */
function formatTooltipLabel(label: string, period: Period): string {
  switch (period) {
    case 'daily': {
      const d = parseDaily(label);
      if (!d) return label;
      return d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: 'UTC',
      });
    }
    case 'weekly': {
      // "2026-W34" → "Week 34, 2026"
      const match = label.match(/^(\d{4})-W(\d{2})$/);
      if (!match) return label;
      return `Week ${parseInt(match[2], 10)}, ${match[1]}`;
    }
    case 'monthly': {
      const d = parseMonthly(label);
      if (!d) return label;
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      });
    }
    case 'yearly':
      return label; // "2026"
  }
}

function parseDaily(label: string): Date | null {
  const m = label.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function parseMonthly(label: string): Date | null {
  const m = label.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, 1));
}

/** Format a number as a short currency string (e.g. 1250 → "$1.3K"). */
function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------

interface RevenueTrendChartProps {
  transactions: Transaction[];
}

export function RevenueTrendChart({ transactions }: RevenueTrendChartProps) {
  const [period, setPeriod] = useState<Period>('monthly');

  const data = useMemo(
    () => aggregateRevenueByPeriod(transactions, period),
    [transactions, period],
  );

  // Derive display-ready data with formatted axis labels.
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        ...d,
        axisLabel: formatAxisLabel(d.label, period),
        tooltipLabel: formatTooltipLabel(d.label, period),
      })),
    [data, period],
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
        Completed revenue over time. For per-currency breakdown use the Currency Status table.
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="axisLabel"
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            interval="preserveStartEnd"
          />
          <YAxis
            tickFormatter={formatCurrency}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            width={64}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
            }}
            formatter={(value) => [formatCurrency(Number(value ?? 0)), 'Completed Revenue']}
            labelFormatter={(_label, payload) => {
              const entry = payload?.[0] as { payload?: { tooltipLabel?: string } } | undefined;
              return entry?.payload?.tooltipLabel ?? '';
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--accent)' }}
            activeDot={{ r: 5 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
