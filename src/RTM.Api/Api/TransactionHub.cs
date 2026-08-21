using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using RTM.Api.Domain;

namespace RTM.Api.Api;

/// <summary>
/// SignalR hub that live dashboards (or any client) connect to in order to
/// receive newly-ingested transactions in real time, and to be handed the
/// existing history immediately on connect (so a fresh client never starts
/// empty).
///
/// The server publishes newly-ingested transactions under the method name
/// <c>"TransactionReceived"</c> via <see cref="IHubContext{THub}"/> (indirectly
/// through <see cref="Domain.ITransactionBroadcaster"/>). On connect, the hub
/// reads the existing history through the injected
/// <see cref="Domain.ITransactionService"/> (cache-aside — served from the cache
/// when Redis is connected) and sends it to the caller under
/// <c>"InitialTransactions"</c>. The hub never talks to the store/cache directly:
/// everything flows through the service (dependency direction preserved).
/// </summary>
public sealed class TransactionHub : Hub
{
    private readonly ITransactionService _service;

    public TransactionHub(ITransactionService service)
    {
        _service = service;
    }

    // Local connected-client count for this process, used only for telemetry.
    // It is per-process on purpose: with the multi-instance PowerDuplication
    // design (see docs/ADR.md) each instance reports its own local count rather
    // than a cluster-wide one.
    public static int ConnectedClients => Volatile.Read(ref _connectedClients);
    private static int _connectedClients;

    public override async Task OnConnectedAsync()
    {
        Interlocked.Increment(ref _connectedClients);

        // History handoff (cache-backed via the service): send the existing
        // transactions to the just-connected client so it does not start empty.
        // Best-effort on the failure/cancel path — the connection itself must
        // not be torn down because a history read failed.
        try
        {
            var history = await _service.GetAllAsync(CancellationToken.None).ConfigureAwait(false);
            if (history.IsSuccess)
                await Clients.Caller.SendAsync("InitialTransactions", history.Value).ConfigureAwait(false);
        }
        catch (OperationCanceledException)
        {
            // Shutdown/cancellation — nothing to log, the connection is going away.
        }

        await base.OnConnectedAsync().ConfigureAwait(false);
    }

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        Interlocked.Decrement(ref _connectedClients);
        return base.OnDisconnectedAsync(exception);
    }

    /// <summary>
    /// Client-invokable endpoint that a live client can post a transaction to,
    /// which is then echoed to all connected clients. Real ingestion flows
    /// through the ingestion API and the broadcaster; this exists as the hub's
    /// client-facing surface for completeness.
    /// </summary>
    public async Task TransactionReceived(Transaction transaction)
    {
        await Clients.All.SendAsync("TransactionReceived", transaction).ConfigureAwait(false);
    }
}

