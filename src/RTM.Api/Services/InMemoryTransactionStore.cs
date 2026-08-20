using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using RTM.Api.Domain;

namespace RTM.Api.Services;

/// <summary>
/// Thread-safe, in-memory <see cref="ITransactionStore"/> backed by a
/// <see cref="ConcurrentDictionary{TKey,TValue}"/> keyed by the transaction id.
///
/// Thread-safety: all mutations go through <see cref="ConcurrentDictionary"/>
/// atomics; there is deliberately NO additional business logic here — just
/// storage, per the layered-architecture rule (Services → Core).
///
/// Duplicate-id semantics (documented): adding the same transactionId twice
/// REPLACES the existing entry (AddOrUpdate / indexer write), keeping the store
/// consistent with exactly one entry per id (latest wins).
/// </summary>
public sealed class InMemoryTransactionStore : ITransactionStore
{
    private readonly ConcurrentDictionary<string, Transaction> _store = new();

    public Task AddAsync(Transaction transaction, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        // Indexer write = atomic add-or-replace keyed by guid-string.
        _store[transaction.TransactionId.ToString()] = transaction;
        return Task.CompletedTask;
    }

    public Task<IEnumerable<Transaction>> GetAllAsync(CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        // Materialize a snapshot (see: Values enumeration is not atomic).
        return Task.FromResult<IEnumerable<Transaction>>(_store.Values.ToList());
    }

    public Task<Transaction?> GetByIdAsync(string transactionId, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        var found = _store.TryGetValue(transactionId, out var tx);
        return Task.FromResult<Transaction?>(found ? tx : null);
    }
}
