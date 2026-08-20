using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using RTM.Api.Domain;

namespace RTM.Api.Api;

/// <summary>
/// SignalR hub that live dashboards (or any client) connect to in order to
/// receive newly-ingested transactions in real time.
///
/// The server publishes transactions under the method name
/// <c>"TransactionReceived"</c> via <see cref="IHubContext{THub}"/> (indirectly
/// through <see cref="Domain.ITransactionBroadcaster"/>). This hub defines the
/// client contract and tracks the connected-client count (local, per process)
/// used for telemetry in the log line "שידור עסקה {id} ל-{N} לקוח".
/// </summary>
public sealed class TransactionHub : Hub
{
    // Local connected-client count for this process, used only for telemetry.
    // It is per-process on purpose: with the multi-instance PowerDuplication
    // design (see docs/ADR.md) each instance reports its own local count rather
    // than a cluster-wide one.
    public static int ConnectedClients => Volatile.Read(ref _connectedClients);
    private static int _connectedClients;

    public override Task OnConnectedAsync()
    {
        Interlocked.Increment(ref _connectedClients);
        return base.OnConnectedAsync();
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
