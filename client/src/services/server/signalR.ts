import * as signalR from '@microsoft/signalr';
import type { Transaction } from '../../types/transaction';
import { SIGNALR_HUB_URL } from './api';

/**
 * Live SignalR client for the transactions hub.
 *
 * Server contract (see src/RTM.Api/Api/TransactionHub.cs):
 *   - received ON CONNECT:  "InitialTransactions" (Transaction[]) — cache-backed history.
 *   - received LIVE:        "TransactionReceived"  (Transaction)   — freshly ingested.
 *
 * The connection is single-use by design: callers pass callbacks and get back
 * the connected hub; use `dispose()` to tear it down.
 */
export interface TransactionHubHandlers {
  onInitialTransactions: (history: Transaction[]) => void;
  onTransactionReceived: (transaction: Transaction) => void;
}

export class TransactionHubClient {
  private _connection: signalR.HubConnection;

  /** Connect to the hub and wire the two server→client methods. */
  constructor(handlers: TransactionHubHandlers) {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(SIGNALR_HUB_URL)
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connection.on('InitialTransactions', (list: Transaction[]) => {
      handlers.onInitialTransactions(list);
    });
    connection.on('TransactionReceived', (tx: Transaction) => {
      handlers.onTransactionReceived(tx);
    });

    this._connection = connection;
  }

  async start(): Promise<void> {
    if (this._connection.state === signalR.HubConnectionState.Disconnected) {
      await this._connection.start();
    }
  }

  /** Gracefully stop the SignalR connection (no-op when already stopped). */
  async dispose(): Promise<void> {
    if (this._connection.state !== signalR.HubConnectionState.Disconnected) {
      await this._connection.stop();
    }
  }
}
