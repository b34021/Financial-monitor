using System.Threading;
using System.Threading.Tasks;

namespace RTM.Api.Domain;

/// <summary>
/// Outbound real-time channel contract (Core, pure — no SignalR dependency).
///
/// Implementations push transaction events to live clients (e.g. a SignalR hub)
/// after ingestion. Semantics are deliberately best-effort: subscribing to a
/// transaction is never allowed to fail ingestion — an implementation must not
/// throw outward; a failure to publish is logged and swallowed locally so the
/// persisted transaction (the source of truth) is never lost.
///
/// Keeping this as a Core interface lets the Services layer depend on Core rather
/// than on the Api layer's SignalR types (preserving dependency direction), and
/// lets unit tests substitute a fake broadcaster.
/// </summary>
public interface ITransactionBroadcaster
{
    /// <summary>
    /// Publishes a successfully-ingested transaction to all connected clients.
    /// Returns the number of clients it was delivered to (optimistic; may be 0).
    /// Implementations must never throw outward.
    /// </summary>
    ValueTask<int> BroadcastReceivedAsync(Transaction transaction, CancellationToken ct = default);
}
