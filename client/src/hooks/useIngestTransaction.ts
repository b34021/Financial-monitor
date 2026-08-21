import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ingestTransaction } from '../services/api';
import type { IngestTransactionRequest, Transaction } from '../types/transaction';

/** Cache key for the "my transactions" feed. */
const TRANSACTIONS_KEY = ['transactions'] as const;

/**
 * Mutation hook for ingesting a new transaction via the REST API.
 *
 * Wraps the axios call (services/api.ts) in a tanstack-query mutation so the
 * page never holds its own pending/error state — `isPending` / `error` /
 * `data` come from here. On success the live feed cache is invalidated so any
 * queryKey-derived lists refresh (see MonitorPage for the SignalR flow).
 */
export function useIngestTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: IngestTransactionRequest) => ingestTransaction(payload),
    onSuccess: (saved) => {
      queryClient.setQueryData<Transaction[]>(TRANSACTIONS_KEY, (current = []) => [
        saved,
        ...current,
      ]);
    },
  });
}
