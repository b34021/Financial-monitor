/**
 * Transaction domain model — mirrors the backend 5-field JSON contract
 * (see CLAUDE.md: no extra fields; status is the same enum).
 *
 * The backend serializes the status as its name (JsonStringEnumConverter),
 * so the TS union uses the exact PascalCase strings the API produces.
 */

export type TransactionStatus = 'Pending' | 'Completed' | 'Failed';

export interface Transaction {
  transactionId: string; // GUID string (lowercase, e.g. "aaaaaaaa-aaaa-...")
  amount: number;        // decimal, in the given currency
  currency: string;      // ISO 4217 3-letter code (e.g. "USD", "ILS")
  status: TransactionStatus;
  timestamp: string;     // UTC ISO-8601, e.g. "2026-08-21T12:00:00+00:00"
}

/** Raw payload posted to the ingestion API (field names match the API contract). */
export interface IngestTransactionRequest {
  transactionId: string;
  amount: number;
  currency: string;
  status: TransactionStatus;
  timestamp: string;
}

/** Narrowing helpers for the status enum in the UI. */
export const isFinalStatus = (status: TransactionStatus): boolean =>
  status === 'Completed' || status === 'Failed';
