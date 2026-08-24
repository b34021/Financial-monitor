import { useMemo, useRef, useCallback, useState, useEffect } from 'react';
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
import { useVirtualizer } from '@tanstack/react-virtual';
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

/** Default estimated row height (px) used before the DOM measurement kicks in. */
const DEFAULT_ROW_HEIGHT = 48;

/** Format a UTC ISO timestamp into a readable local date+time string. */
function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * Professional real-time table view for the live transaction feed.
 *
 * Implements **virtual scrolling** via `@tanstack/react-virtual` so only
 * the visible rows + a small overscan buffer are rendered in the DOM,
 * keeping the component fast even with thousands of transactions.
 *
 * How it works:
 * 1. `useVirtualizer` wraps the scrollable container and maps each
 *    transaction index to a virtual item (position + size).
 * 2. The `<tbody>` only renders `virtualItems` — a tiny slice of the
 *    full sorted list.
 * 3. Variable row heights are handled by `estimateSize` (default) +
 *    `measureElement` which reads the actual DOM height via a `ref`
 *    callback on every `<tr>`.
 * 4. The virtualizer container height matches the parent; when the
 *    user is scrolled to older rows, new prepended items do not push
 *    the viewport — the scroll offset stays stable.
 *
 * Columns: Transaction ID, Amount, Currency, Status, Timestamp.
 * Features: sortable columns, sticky header, row striping, hover state,
 * responsive horizontal scroll, professional empty state.
 */
export function TransactionTable({
  transactions,
  statusFilter,
  onStatusFilterChange,
}: {
  transactions: Transaction[];
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
}) {
  /** Ref attached to the scrollable <div> that the virtualizer observes. */
  const scrollRef = useRef<HTMLDivElement>(null);

  /** Client-side filter: minimum amount (0 = no filter). */
  const [minAmount, setMinAmount] = useState<number>(0);

  /** Auto-scroll toggle — when ON the container scrolls to top on every new batch. */
  const [autoScroll, setAutoScroll] = useState(false);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [autoScroll, transactions.length]);

  /** Memoized filtered list — AND logic: status match + amount check. */
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (statusFilter !== 'All' && tx.status !== statusFilter) return false;
      if (minAmount > 0 && tx.amount < minAmount) return false;
      return true;
    });
  }, [transactions, statusFilter, minAmount]);

  const columnWidths = useMemo(
    () => ['26%', '14%', '12%', '14%', '34%'] as const,
    [],
  );

  type ColMeta = { width: string };

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
        meta: { width: columnWidths[0] } satisfies ColMeta,
      }),
      columnHelper.accessor('amount', {
        header: 'Amount',
        cell: (info) => info.getValue().toLocaleString(),
        meta: { width: columnWidths[1] } satisfies ColMeta,
      }),
      columnHelper.accessor('currency', {
        header: 'Currency',
        meta: { width: columnWidths[2] } satisfies ColMeta,
      }),
      columnHelper.accessor('status', {
        header: 'Status',
        cell: (info) => <StatusBadge status={info.getValue()} />,
        meta: { width: columnWidths[3] } satisfies ColMeta,
      }),
      columnHelper.accessor('timestamp', {
        header: 'Timestamp',
        cell: (info) => formatTimestamp(info.getValue()),
        meta: { width: columnWidths[4] } satisfies ColMeta,
      }),
    ],
    [],
  );

  const table = useTable(
    {
      features,
      columns: columns as readonly ReturnType<typeof columnHelper.accessor>[],
      data: filteredTransactions,
      initialState: {
        sorting: [{ id: 'timestamp', desc: true }],
      },
    },
    (state) => ({ sorting: state.sorting }),
  );

  const sortedRows = table.getRowModel().rows;

  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => DEFAULT_ROW_HEIGHT,
    /** Stable identity key — uses transactionId so React keeps DOM nodes stable across re-sorts. */
    getItemKey: useCallback(
      (index: number) => sortedRows[index]?.original.transactionId ?? index,
      [sortedRows],
    ),
    /** Measure the actual DOM height once the row is mounted. */
    measureElement: (el) => el.getBoundingClientRect().height,
    overscan: 5,
  });

  /** Height of the sticky header — rows start below it. */
  const HEADER_HEIGHT = 48;

  /** ── Track newly arrived transactions for slide-in + flash ── */
  const slideInIdsRef = useRef<Set<string>>(new Set());
  const flashIdsRef = useRef<Set<string>>(new Set());
  const prevDataRef = useRef<Transaction[]>(filteredTransactions);
  const [, setTick] = useState(0);

  useEffect(() => {
    const prevIds = new Set(prevDataRef.current.map((t) => t.transactionId));
    let changed = false;
    for (const tx of filteredTransactions) {
      if (!prevIds.has(tx.transactionId)) {
        slideInIdsRef.current.add(tx.transactionId);
        flashIdsRef.current.add(tx.transactionId);
        changed = true;
        setTimeout(() => {
          slideInIdsRef.current.delete(tx.transactionId);
          setTick((n) => n + 1);
        }, 400);
        setTimeout(() => {
          flashIdsRef.current.delete(tx.transactionId);
          setTick((n) => n + 1);
        }, 1500);
      }
    }
    prevDataRef.current = filteredTransactions;
    if (changed) setTick((n) => n + 1);
  }, [filteredTransactions]);

  function animationClasses(tx: Transaction): string {
    const parts: string[] = [];
    if (slideInIdsRef.current.has(tx.transactionId)) parts.push('tx-table__row--enter');
    if (flashIdsRef.current.has(tx.transactionId)) parts.push('tx-table__row--flash');
    return parts.join(' ');
  }

  if (transactions.length === 0) {
    return (
      <div className="tx-table__empty">
        <p>No transactions yet</p>
      </div>
    );
  }

  /** Available statuses for the dropdown. */
  const statusOptions: Array<{ label: string; value: string }> = [
    { label: 'All', value: 'All' },
    { label: 'Pending', value: 'Pending' },
    { label: 'Completed', value: 'Completed' },
    { label: 'Failed', value: 'Failed' },
  ];

  return (
    <div>
      {/* ── Filter row inline above the table ── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="pill-filter"
          aria-label="Filter by status"
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          type="number"
          min={0}
          step={100}
          placeholder="Min $"
          value={minAmount || ''}
          onChange={(e) => setMinAmount(e.target.valueAsNumber || 0)}
          className="pill-filter pill-filter--num"
          aria-label="Minimum amount filter"
        />

        <button
          type="button"
          className={`auto-scroll-btn${autoScroll ? ' auto-scroll-btn--on' : ''}`}
          onClick={() => setAutoScroll((v) => !v)}
          title={autoScroll ? 'Auto-scroll: on' : 'Auto-scroll: off'}
          aria-label={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
          aria-pressed={autoScroll}
        >
          <svg
            viewBox="0 0 24 24"
            className="auto-scroll-btn__icon"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>

        <span className="ml-auto text-xs font-medium text-[var(--muted)]">
          {filteredTransactions.length} transaction{filteredTransactions.length === 1 ? '' : 's'} visible
        </span>
      </div>

      <div className="tx-table__wrapper" ref={scrollRef} style={{ overflow: 'auto' }}>
      {/* Inline wrapper so the virtualizer can control the total scroll height. */}
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        <table className="tx-table" style={{ position: 'relative', tableLayout: 'fixed' }}>
          <colgroup>
            {columnWidths.map((w, i) => (
              <col key={`col-${i}`} style={{ width: w }} />
            ))}
          </colgroup>
          <thead className="tx-table__head" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`tx-table__th${header.column.getCanSort() ? ' tx-table__th--sortable' : ''}`}
                    style={{ width: (header.column.columnDef.meta as ColMeta)?.width }}
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
          <tbody className="tx-table__body" style={{ position: 'relative', top: `${HEADER_HEIGHT}px` }}>
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const row = sortedRows[virtualItem.index];
              return (
                <tr
                  key={row.id}
                  data-index={virtualItem.index}
                  ref={(node) => {
                    if (node) virtualizer.measureElement(node);
                  }}
                  className={['tx-table__row', animationClasses(row.original)].filter(Boolean).join(' ')}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id} className="tx-table__td" style={{ width: (cell.column.columnDef.meta as ColMeta)?.width }}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </div>
  );
}
