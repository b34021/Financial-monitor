using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using RTM.Api.Domain;

namespace RTM.Api.Api;

/// <summary>
/// SignalR-backed implementation of <see cref="ITransactionBroadcaster"/>
/// (Api layer): pushes ingested transactions to all connected hub clients via
/// <see cref="IHubContext{THub}"/>.
///
/// Best-effort by design: a failed/empty publish must never break the ingestion
/// flow — <see cref="RTM.Api.Services.TransactionService"/> persists the
/// transaction first (that is the source of truth), and this broadcaster only
/// supplements it with a live push. Failures here are logged (Warning) and
/// swallowed so the caller's Result stays unaffected.
/// </summary>
public sealed class SignalRTransactionBroadcaster : ITransactionBroadcaster
{
    private readonly IHubContext<TransactionHub> _hub;
    private readonly ILogger<SignalRTransactionBroadcaster> _logger;

    public SignalRTransactionBroadcaster(
        IHubContext<TransactionHub> hub,
        ILogger<SignalRTransactionBroadcaster> logger)
    {
        _hub = hub;
        _logger = logger;
    }

    public async ValueTask<int> BroadcastReceivedAsync(Transaction transaction, CancellationToken ct = default)
    {
        var clientCount = TransactionHub.ConnectedClients;
        try
        {
            await _hub.Clients.All.SendAsync("TransactionReceived", transaction, ct).ConfigureAwait(false);
            return clientCount;
        }
        catch (OperationCanceledException)
        {
            // Publisher/observer cancellation is not an ingestion failure — the
            // transaction was already persisted. Log and swallow.
            _logger.LogWarning(
                "Broadcast of transaction {TransactionId} was cancelled (request aborted).",
                transaction.TransactionId);
            return 0;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(
                ex,
                "Broadcast of transaction {TransactionId} failed; the transaction remains persisted.",
                transaction.TransactionId);
            return 0;
        }
    }
}
