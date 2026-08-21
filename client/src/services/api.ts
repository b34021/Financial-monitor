import axios from 'axios';
import type { IngestTransactionRequest, Transaction } from '../types/transaction';

/**
 * Shared axios instance for the RTM ingestion/history REST API.
 *
 * The backend is a minimal-API .NET service. The dev server proxies
 * `/api` to the backend via the Vite proxy (see vite.config.ts) so the
 * client calls same-origin relative paths — no CORS setup required in
 * the browser. Override with VITE_API_BASE_URL for a different backend.
 */
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
});

/** Extract a readable message from an axios error (backend 400 validation). */
function toReadableErrorMessage(error: unknown): string {
  if (!axios.isAxiosError(error)) {
    return error instanceof Error ? error.message : 'Unexpected error.';
  }
  // Backend returns a ValidationProblem (400) with a JSON body.
  const body = error.response?.data as { error?: string; title?: string } | undefined;
  return body?.error ?? body?.title ?? `HTTP ${error.response?.status ?? 0}`;
}

/**
 * POST a raw transaction payload to the ingestion endpoint.
 *
 * `signal` (optional) lets the caller abort an in-flight request — react-query
 * passes the AbortSignal it holds for the mutation, which aborts the underlying
 * HTTP call when the component unmounts or a new submit starts. An aborted
 * request surfaces as an axios CanceledError, which we surface as an
 * AbortError (matched by the caller's cancellation handling).
 */
export async function ingestTransaction(
  payload: IngestTransactionRequest,
  signal?: AbortSignal,
): Promise<Transaction> {
  try {
    const { data } = await api.post<Transaction>('/transactions', payload, { signal });
    return data;
  } catch (error) {
    // Bail out of cancellation/abort without wrapping it — the caller treats
    // it as a non-error (see useIngestTransaction). Everything else becomes a
    // readable message.
    if (axios.isCancel(error)) {
      throw new DOMException('Aborted', 'AbortError');
    }
    throw new Error(toReadableErrorMessage(error));
  }
}

/** URL for the SignalR hub endpoint (same origin, proxied in dev). */
export const SIGNALR_HUB_URL = import.meta.env.VITE_HUB_URL ?? '/hubs/transactions';
