import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ingestTransaction } from '../services/server/api';
import type { IngestTransactionRequest, Transaction } from '../types/transaction';

/** Cache key for the "my transactions" feed. */
const TRANSACTIONS_KEY = ['transactions'] as const;

/**
 * Mutation hook for ingesting a new transaction via the REST API.
 *
 * Wraps the axios call (services/api.ts) in a tanstack-query mutation so the
 * page never holds its own pending/error state — `isPending` / `error` /
 * `data` come from here.
 *
 * Cancellation: react-query v5 does NOT surface an AbortSignal to mutationFn,
 * so we own an `AbortController` via a ref. Starting a new submit cancels any
 * in-flight request, and unmounting the consuming page aborts it too — hence a
 * fast double-click or a navigation never leaks a stale response. A deliberate
 * cancel throws an AbortError, which AddPage filters out of the UI.
 *
 * On success the "transactions" cache is refreshed so derived lists stay in
 * sync (see MonitorPage for the SignalR flow).
 */
export function useIngestTransaction() {
  const queryClient = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  // Abort any in-flight request when the consumer unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return useMutation({
    mutationFn: async (payload: IngestTransactionRequest) => {
      // Cancel a previous in-flight request so a re-submit supersedes it.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        return await ingestTransaction(payload, controller.signal);
      } finally {
        // Only clear the ref if it still points at our controller, so a later
        // submit's controller isn't dropped by the finished this one.
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<Transaction[]>(TRANSACTIONS_KEY, (current = []) => [
        saved,
        ...current,
      ]);
    },
  });
}
