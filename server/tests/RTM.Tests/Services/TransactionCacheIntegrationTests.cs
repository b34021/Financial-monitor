using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using RTM.Domain;
using RTM.Application;
using RTM.Infrastructure;
using Xunit;

namespace RTM.Tests.Services;

/// <summary>
/// TDD tests for the cache integration (cache-aside + write-through + fallback)
/// inside <see cref="TransactionService"/>. A hand-rolled in-memory store fake
/// and a scriptable in-memory cache fake keep the tests unit-scoped to the
/// Service with full controllability of availability and cache contents.
/// </summary>
public class TransactionCacheIntegrationTests
{
    private static readonly Guid IdA = new("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid IdB = new("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    private static Transaction NewTx(Guid id) =>
        new(id, 10m, "USD", TransactionStatus.Pending, DateTimeOffset.UtcNow);

    private static T Run<T>(Task<T> t) => t.GetAwaiter().GetResult();

    private sealed class FakeStore : ITransactionStore
    {
        private readonly Dictionary<string, Transaction> _items = new();
        public int GetAllCalls { get; private set; }
        public int GetByIdCalls { get; private set; }

        public Task AddAsync(Transaction tx, CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            _items[tx.TransactionId.ToString()] = tx;
            return Task.CompletedTask;
        }

        // Test hook: seed the store directly, bypassing the service (so the
        // cache is left empty), simulating a transaction written by another path.
        public void Seed(Transaction tx) => _items[tx.TransactionId.ToString()] = tx;

        public Task<IEnumerable<Transaction>> GetAllAsync(CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            GetAllCalls++;
            return Task.FromResult<IEnumerable<Transaction>>(_items.Values.ToList());
        }

        public Task<IEnumerable<Transaction>> GetLatestAsync(int count, CancellationToken ct)
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult<IEnumerable<Transaction>>(
                _items.Values.OrderByDescending(t => t.Timestamp).Take(count).ToList());
        }

        public Task<Transaction?> GetByIdAsync(string id, CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            GetByIdCalls++;
            _items.TryGetValue(id, out var tx);
            return Task.FromResult<Transaction?>(tx);
        }
    }

    /// <summary>
    /// Scriptable in-memory cache fake: counts mutations and reflects the
    /// availability switch. Enables the fallback/counter assertions.
    /// </summary>
    private sealed class FakeCache : ITransactionCache
    {
        private readonly Dictionary<string, Transaction> _singles = new();
        private List<Transaction>? _list;
        public bool Available { get; set; } = true;

        public int SingleWrites { get; private set; }
        public int ListWrites { get; private set; }
        public int ListInvalidations { get; private set; }
        public int SingleReads { get; private set; }
        public int ListReads { get; private set; }

        public ValueTask<bool> IsAvailableAsync(CancellationToken ct = default) => ValueTask.FromResult(Available);

        public ValueTask<Transaction?> GetCachedAsync(string transactionId, CancellationToken ct = default)
        {
            SingleReads++;
            _singles.TryGetValue(transactionId, out var tx);
            return ValueTask.FromResult(tx);
        }

        public ValueTask SetCachedAsync(Transaction tx, CancellationToken ct = default)
        {
            SingleWrites++;
            _singles[tx.TransactionId.ToString()] = tx;
            return ValueTask.CompletedTask;
        }

        public ValueTask<IReadOnlyList<Transaction>?> GetCachedListAsync(CancellationToken ct = default)
        {
            ListReads++;
            return ValueTask.FromResult<IReadOnlyList<Transaction>?>(_list);
        }

        public ValueTask SetCachedListAsync(IEnumerable<Transaction> txs, CancellationToken ct = default)
        {
            ListWrites++;
            _list = new List<Transaction>(txs);
            return ValueTask.CompletedTask;
        }

        public ValueTask InvalidateListAsync(CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            ListInvalidations++;
            _list = null;
            return ValueTask.CompletedTask;
        }
    }

    /// <summary>No-op broadcaster: cache tests are unrelated to the live push.</summary>
    private sealed class NullBroadcaster : ITransactionBroadcaster
    {
        public ValueTask<int> BroadcastReceivedAsync(Transaction transaction, CancellationToken ct = default)
            => ValueTask.FromResult(0);
    }

    private readonly FakeStore _store = new();
    private readonly FakeCache _cache = new();
    private readonly TransactionService _service;

    public TransactionCacheIntegrationTests()
    {
        _service = new TransactionService(_store, _cache, new NullBroadcaster(), NullLogger<TransactionService>.Instance);
    }

    // 1. Cache-aside for GetAllAsync: first read misses (store), second read
    //    is served from the cache without touching the store again.
    [Fact]
    public void GetAll_CacheAside_SecondReadServedFromCache()
    {
        Run(_service.ProcessAsync(IdA, 10m, "USD", TransactionStatus.Pending, DateTimeOffset.UtcNow, CancellationToken.None));
        Run(_service.ProcessAsync(IdB, 20m, "EUR", TransactionStatus.Completed, DateTimeOffset.UtcNow, CancellationToken.None));

        Run(_service.GetAllAsync(CancellationToken.None));
        var second = Run(_service.GetAllAsync(CancellationToken.None));

        Assert.Equal(2, second.Value!.Count);
        Assert.Equal(1, _store.GetAllCalls);          // only the first (miss) hit the store
        Assert.Equal(2, _cache.ListReads);            // both reads consulted the cache
        Assert.Equal(1, _cache.ListWrites);           // one populate after the miss
    }

    // 2. Cache unavailable → operations fall back to the store every time.
    [Fact]
    public void GetAll_CacheUnavailable_FallsBackToStore()
    {
        _cache.Available = false;
        Run(_service.ProcessAsync(IdA, 10m, "USD", TransactionStatus.Pending, DateTimeOffset.UtcNow, CancellationToken.None));

        var first = Run(_service.GetAllAsync(CancellationToken.None));
        var second = Run(_service.GetAllAsync(CancellationToken.None));

        Assert.Single(first.Value!);
        Assert.Equal(2, _store.GetAllCalls);          // store hit on both reads
    }

    // 3. Write-through: after ProcessAsync the value is immediately in the cache.
    [Fact]
    public async Task Process_WriteThrough_ValueVisibleInCache()
    {
        await _service.ProcessAsync(IdA, 55.5m, "ILS", TransactionStatus.Failed, DateTimeOffset.UtcNow, CancellationToken.None);

        var cached = await _cache.GetCachedAsync(IdA.ToString());
        Assert.NotNull(cached);
        Assert.Equal(IdA, cached!.TransactionId);
        Assert.Equal(1, _cache.SingleWrites);
    }

    // 4. Cache-aside for GetByIdAsync: miss → store, then populated; a second
    //    read is served from the cache. The store is seeded directly so the
    //    cache starts empty (no write-through happened yet).
    [Fact]
    public void GetById_CacheAside_PopulatesOnce_ThenServedFromCache()
    {
        _store.Seed(NewTx(IdA));

        var first = Run(_service.GetByIdAsync(IdA.ToString(), CancellationToken.None));
        var second = Run(_service.GetByIdAsync(IdA.ToString(), CancellationToken.None));

        Assert.NotNull(first.Value);
        Assert.NotNull(second.Value);
        Assert.Equal(1, _store.GetByIdCalls);         // only the first (miss) hit the store
        Assert.Equal(1, _cache.SingleWrites);         // populated exactly once after the miss
        Assert.Equal(2, _cache.SingleReads);           // both reads consulted the cache
    }

    /// <summary>
    /// RED (P0-4a): a fresh GetAllAsync read must reflect a newly-written
    /// transaction even after the full-list cache was already populated. In
    /// production (Redis connected) the bug is: ProcessAsync refreshes only the
    /// single-entry key, leaving "t:all" stale forever → a second dashboard
    /// client never sees the new transaction until the list expires. The fix
    /// invalidates the list on every write-through so the next read re-queries
    /// the store.
    /// </summary>
    [Fact]
    public void GetAll_AfterNewTransaction_ReflectsIt()
    {
        // 1. Ingest A → write-through refreshes the single key only.
        Run(_service.ProcessAsync(IdA, 10m, "USD", TransactionStatus.Pending, DateTimeOffset.UtcNow, CancellationToken.None));

        // 2. First GetAll → cache miss → repopulate "t:all" from the store.
        var afterA = Run(_service.GetAllAsync(CancellationToken.None));
        Assert.Single(afterA.Value!);
        Assert.Equal(1, _cache.ListWrites);            // list is now cached

        // 3. Ingest B after the list was already cached. Every write-through
        //    must invalidate the stale list (one per ProcessAsync call).
        Run(_service.ProcessAsync(IdB, 20m, "EUR", TransactionStatus.Completed, DateTimeOffset.UtcNow, CancellationToken.None));
        Assert.Equal(2, _cache.ListInvalidations);      // one invalidation per write-through

        // 4. Second GetAll must now reflect BOTH A and B (not serve stale "t:all").
        var afterB = Run(_service.GetAllAsync(CancellationToken.None));
        Assert.Equal(2, afterB.Value!.Count);
        Assert.False(afterB.Value!.All(t => t.TransactionId == IdA));
    }
}
