using Microsoft.Extensions.Logging;
using RTM.Domain;

namespace RTM.Infrastructure;

/// <summary>
/// <see cref="ITransactionCache"/> implementation that adapts the generic
/// string-based <see cref="ICacheProvider"/> to the transaction-typed contract,
/// serializing <see cref="Transaction"/> values to JSON.
///
/// Best-effort adapter: if the underlying provider is not connected, reads
/// behave as missing (null / empty) and writes are skipped — callers fall back
/// to the store and never see a hard failure. Keys:
///   • single entry → "t:{transactionId}"
///   • full list    → "t:all"
/// </summary>
public sealed class TransactionCache : ITransactionCache
{
    private const string ListKey = "t:all";

    private readonly ICacheProvider _inner;
    private readonly ILogger<TransactionCache> _logger;
    private readonly TimeSpan? _listTtl;

    public TransactionCache(ICacheProvider inner, ILogger<TransactionCache> logger, TimeSpan? listTtl = null)
    {
        _inner = inner;
        _logger = logger;
        _listTtl = listTtl;
    }

    public ValueTask<bool> IsAvailableAsync(CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        // Availability follows the real connection state of the wrapped provider.
        return ValueTask.FromResult(_inner.IsConnected);
    }

    public async ValueTask<Transaction?> GetCachedAsync(string transactionId, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (!_inner.IsConnected)
            return null;

        var raw = await _inner.GetAsync(KeyFor(transactionId), ct).ConfigureAwait(false);
        if (raw is null)
            return null;

        try
        {
            return Deserialize(raw);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to deserialize cached transaction for {Id}; treating as miss.", transactionId);
            return null;
        }
    }

    public async ValueTask SetCachedAsync(Transaction transaction, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (!_inner.IsConnected)
            return;

        await _inner.SetAsync(KeyFor(transaction.TransactionId.ToString()), Serialize(transaction), ct: ct).ConfigureAwait(false);
    }

    public async ValueTask<IReadOnlyList<Transaction>?> GetCachedListAsync(CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (!_inner.IsConnected)
            return null;

        var raw = await _inner.GetAsync(ListKey, ct).ConfigureAwait(false);
        if (raw is null)
            return null;

        try
        {
            return DeserializeList(raw);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to deserialize cached transaction list; treating as miss.");
            return null;
        }
    }

    public async ValueTask SetCachedListAsync(IEnumerable<Transaction> transactions, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (!_inner.IsConnected)
            return;

        // The full list gets a short TTL (configurable): even if a write-through
        // invalidation is ever missed, a stale list self-expires and the next read
        // re-queries the store. See Cache:ListTtlSeconds.
        await _inner.SetAsync(ListKey, SerializeList(transactions), expiry: _listTtl, ct: ct).ConfigureAwait(false);
    }

    public async ValueTask InvalidateListAsync(CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        if (!_inner.IsConnected)
            return;

        await _inner.RemoveAsync(ListKey, ct).ConfigureAwait(false);
    }

    private static string KeyFor(string id) => $"t:{id}";

    private static string Serialize(Transaction t) => System.Text.Json.JsonSerializer.Serialize(t);

    private static string SerializeList(IEnumerable<Transaction> items) =>
        System.Text.Json.JsonSerializer.Serialize(items);

    private static Transaction Deserialize(string json) =>
        System.Text.Json.JsonSerializer.Deserialize<Transaction>(json)!;

    private static IReadOnlyList<Transaction> DeserializeList(string json) =>
        System.Text.Json.JsonSerializer.Deserialize<List<Transaction>>(json) ?? new List<Transaction>();
}
