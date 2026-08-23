import { useMemo } from 'react';
import {
  useTable,
  flexRender,
  tableFeatures,
  rowSortingFeature,
  sortFns,
  createColumnHelper,
  createCoreRowModel,
  createSortedRowModel,
} from '@tanstack/react-table';
import type { Transaction } from '../types/transaction';
import { StatusBadge } from './StatusBadge';

/**
 * v9 table features: core + sorting.
 * Tree-shakeable — no pagination, filtering, grouping, etc.
 */
const features = tableFeatures({
  coreRowModel: createCoreRowModel(),
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});

type F = typeof features;

const columnHelper = createColumnHelper<F, Transaction>();

/** Format a UTC ISO timestamp into a readable local date+time string. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Professional real-time table view for the live transaction feed.
 *
 * Renders transactions in a sortable grid/table using TanStack Table v9.
 * Receives data through props (the same `visibleList` that feeds the Cards view)
 * — it does NOT connect to SignalR, fetch the backend, or maintain its own
 * transaction state.
 *
 * Columns: Transaction ID, Amount, Currency, Status, Timestamp.
 * Features: sortable columns, sticky header, row striping, hover state,
 * responsive horizontal scroll, professional empty state, and a subtle
 * entrance animation for newly appearing rows.
 */
export function TransactionTable({ transactions }: { transactions: Transaction[] }) {
  const columns = useMemo(
    () => [
      columnHelper.accessor('transactionId', {
        header: 'Transaction ID',
        cell: (info) => (
          <span className="tx-table__id" title={info.getValue()}>
            {info.getValue()}
          </span>
        ),
        enableSorting: false,
      }),
      columnHelper.accessor('amount', {
        header: 'Amount',
        cell: (info) => info.getValue().toLocaleString(),
      }),
      columnHelper.accessor('currency', {
        header: 'Currency',
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={info.getValue()} />,
      }),
      columnHelper.accessor('timestamp', {
        header: 'Timestamp',
        cell: (info) => formatTimestamp(info.getValue()),
      }),
    ],
    [],
  );

  const table = useTable(
    {
      features,
      columns: columns as readonly ReturnType<typeof columnHelper.accessor>[],
      data: transactions,
      initialState: {
        sorting: [{ id: 'timestamp', desc: true }],
      },
    },
    (state) => ({ sorting: state.sorting }),
  );

  if (transactions.length === 0) {
    return (
      <div className="tx-table__empty">
        <p>No transactions yet</p>
      </div>
    );
  }

  return (
    <div className="tx-table__wrapper">
      <table className="tx-table">
        <thead className="tx-table__head">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className={`tx-table__th${header.column.getCanSort() ? ' tx-table__th--sortable' : ''}`}
                  onClick={header.column.getToggleSortingHandler()}
                  aria-sort={
                    header.column.getIsSorted() === 'asc'
                      ? 'ascending'
                      : header.column.getIsSorted() === 'desc'
                        ? 'descending'
                        : 'none'
                  }
                  tabIndex={header.column.getCanSort() ? 0 : undefined}
                  onKeyDown={
                    header.column.getCanSort()
                      ? (e: React.KeyboardEvent) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            header.column.getToggleSortingHandler()?.(e);
                          }
                        }
                      : undefined
                  }
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() ? (
                    <span className="tx-table__sort-icon" aria-hidden="true">
                      {header.column.getIsSorted() === 'asc' ? ' ▲' : ' ▼'}
                    </span>
                  ) : header.column.getCanSort() ? (
                    <span className="tx-table__sort-icon tx-table__sort-icon--inactive" aria-hidden="true">
                      {' '}⇅
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="tx-table__body">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="tx-table__row">
              {row.getAllCells().map((cell) => (
                <td key={cell.id} className="tx-table__td">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
