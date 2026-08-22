using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace RTM.Api.Domain;

/// <summary>
/// Application-layer transaction cache contract (Core, pure — no external
/// dependency).
///
/// Serves the Services layer's cache-aside / write-through flows:
///   • a single transaction is cached under a per-id key (for GetByIdAsync);
///   • the full set is cached under a special list key (for GetAllAsync).
///
/// Semantics are deliberately best-effort: implementations must never throw on
/// an unavailable cache — callers treat a miss (null / empty list) or a
/// non-available cache exactly like "not in cache" and fall back to the store.
/// </summary>
public interface ITransactionCache
{
    /// <summary>Whether a real cache backend is currently reachable.</summary>
    ValueTask<bool> IsAvailableAsync(CancellationToken ct = default);

    /// <summary>
    /// Reads a single cached transaction by its id (guid-string), or
    /// <c>null</c> when it is absent / expired / the cache is unavailable.
    /// </summary>
    ValueTask<Transaction?> GetCachedAsync(string transactionId, CancellationToken ct = default);

    /// <summary>Writes (or refreshes) a single transaction under its per-id key.</summary>
    ValueTask SetCachedAsync(Transaction transaction, CancellationToken ct = default);

    /// <summary>
    /// Reads the cached full list of transactions, or <c>null</c> when absent /
    /// expired / cache unavailable.
    /// </summary>
    ValueTask<IReadOnlyList<Transaction>?> GetCachedListAsync(CancellationToken ct = default);

    /// <summary>Replaces the cached full list of transactions.</summary>
    ValueTask SetCachedListAsync(IEnumerable<Transaction> transactions, CancellationToken ct = default);

    /// <summary>
    /// Invalidates the cached full list ("t:all"). Must be called after a new
    /// transaction is written (write-through) so the next
    /// <see cref="GetCachedListAsync"/> misses and re-queries the store — a fresh
    /// dashboard client never sees stale history. Best-effort: no-op when absent
    /// or cache unavailable.
    /// </summary>
    ValueTask InvalidateListAsync(CancellationToken ct = default);
}
