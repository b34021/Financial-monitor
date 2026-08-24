using System.Collections.Concurrent;
using RTM.Domain;

namespace RTM.Infrastructure;

/// <summary>
/// Thread-safe, in-memory <see cref="ITransactionStore"/> backed by a
/// <see cref="ConcurrentDictionary{TKey,TValue}"/> keyed by the transaction id,
/// capped at <see cref="MaxTransactions"/> entries (the "latest N" the spec
/// asks for — a bounded buffer, not an ever-growing history).
///
/// Thread-safety: all mutations go through <see cref="ConcurrentDictionary"/>
/// atomics. Trimming is a best-effort upper-bound: concurrent writers may
/// briefly exceed the cap, and only after the peak pass does the store settle
/// back at ≤ <see cref="MaxTransactions"/>. That is the correct trade-off for
/// a deterministic "latest window" without serialising every write on a lock.
///
/// Duplicate-id semantics (documented): adding the same transactionId twice
/// REPLACES the existing entry (AddOrUpdate / indexer write), keeping the store
/// consistent with exactly one entry per id (latest wins).
/// </summary>
public sealed class InMemoryTransactionStore : ITransactionStore
{
    /// <summary>Upper bound on stored transactions (the spec's "latest").</summary>
    public const int MaxTransactions = 200;

    private readonly ConcurrentDictionary<string, Transaction> _store = new();

    public Task AddAsync(Transaction transaction, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        // Indexer write = atomic add-or-replace keyed by guid-string.
        _store[transaction.TransactionId.ToString()] = transaction;
        TrimIfNeeded();
        return Task.CompletedTask;
    }

    public Task<IEnumerable<Transaction>> GetAllAsync(CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        // Materialize a snapshot (see: Values enumeration is not atomic).
        return Task.FromResult<IEnumerable<Transaction>>(_store.Values.ToList());
    }

    public Task<IEnumerable<Transaction>> GetLatestAsync(int count, CancellationToken ct)
    {
        ct.ThrowIfCancellationRequested();
        // Latest window, newest first. Take() is bounded so callers never pull
        // the whole history: this is what the hub uses to hand a fresh
        // dashboard its initial view.
        var latest = _store.Values
            .OrderByDescending(t => t.Timestamp)
            .Take(count)
            .ToList();
        return Task.FromResult<IEnumerable<Transaction>>(latest);
    }

    public Task<Transaction?> GetByIdAsync(string transactionId, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        var found = _store.TryGetValue(transactionId, out var tx);
        return Task.FromResult<Transaction?>(found ? tx : null);
    }

    /// <summary>
    /// Best-effort cap: evict the entry with the earliest timestamp while over
    /// the limit. Scanning ≤ 200 entries to find the oldest is negligible; a
    /// concurrent min-queue would be premature optimisation here.
    /// </summary>
    private void TrimIfNeeded()
    {
        while (_store.Count > MaxTransactions)
        {
            KeyValuePair<string, Transaction>? oldest = default;
            foreach (var kvp in _store)
            {
                if (oldest is null || kvp.Value.Timestamp < oldest.Value.Value.Timestamp)
                    oldest = kvp;
            }
            if (oldest is null)
                return;
            _store.TryRemove(oldest.Value.Key, out _);
        }
    }
}
