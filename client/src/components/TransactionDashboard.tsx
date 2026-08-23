import { CurrencyStatusChart } from './CurrencyStatusChart';
import { DashboardKpiGrid } from './DashboardKpiGrid';
import { RevenueTrendChart } from './RevenueTrendChart';
import { StatusPieChart } from './StatusPieChart';
import type { Transaction } from '../types/transaction';

interface TransactionDashboardProps {
  transactions: Transaction[];
}

/**
 * Analytics dashboard — KPI grid and charts composed from the live
 * transaction window. Pure-presentation: no network, no state, no side-effects.
 */
export function TransactionDashboard({ transactions }: TransactionDashboardProps) {
  return (
    <div className="dashboard">
      <DashboardKpiGrid transactions={transactions} />
      <div className="dashboard__charts-row">
        <div className="dashboard__chart-col">
          <StatusPieChart transactions={transactions} />
        </div>
        <div className="dashboard__chart-col">
          <RevenueTrendChart transactions={transactions} />
        </div>
      </div>
      <CurrencyStatusChart transactions={transactions} />
    </div>
  );
}
