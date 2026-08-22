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
    /// <summary>Bounded "latest window" handed to a client on connect.</summary>
    private const int LatestWindowSize = 200;

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

        // History handoff: hand the just-connected client the "latest window"
        // (the bounded most-recent entries, via the service store) so it does
        // not start empty — without draining or serialising the whole history.
        // Best-effort on the failure/cancel path — the connection itself must
        // not be torn down because a history read failed.
        try
        {
            var history = await _service.GetLatestAsync(LatestWindowSize, CancellationToken.None).ConfigureAwait(false);
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
}

