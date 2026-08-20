using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using RTM.Api.Domain;
using RTM.Api.Services;
using Xunit;

namespace RTM.Tests.Services;

/// <summary>
/// TDD tests for <see cref="TransactionService"/>. Hand-rolled in-memory fakes
/// keep the tests unit-scoped to the Service (no external mock framework needed).
/// </summary>
public class TransactionServiceTests
{
    // Convention for a valid payload.
    private static readonly Guid ValidId = new("11111111-1111-1111-1111-111111111111");
    private const decimal ValidAmount = 100.5m;
    private const string ValidCurrency = "USD";
    private static readonly TransactionStatus ValidStatus = TransactionStatus.Pending;
    private static readonly DateTimeOffset ValidTimestamp = DateTimeOffset.UtcNow;

    private static Task<Result<Transaction>> Process(TransactionService service, params object[] raw)
    {
        var id = raw.Length > 0 ? (Guid)raw[0] : ValidId;
        var amount = raw.Length > 1 ? (decimal)raw[1] : ValidAmount;
        var currency = raw.Length > 2 ? (string)raw[2]! : ValidCurrency;
        var status = raw.Length > 3 ? (TransactionStatus)raw[3] : ValidStatus;
        var ts = raw.Length > 4 ? (DateTimeOffset)raw[4] : ValidTimestamp;
        return service.ProcessAsync(id, amount, currency, status, ts, CancellationToken.None);
    }

    private static T Run<T>(Task<T> t) => t.GetAwaiter().GetResult();

    private sealed class FakeStore : ITransactionStore
    {
        private readonly List<Transaction> _items = new();
        public List<Transaction> Saved => _items;

        public Task AddAsync(Transaction transaction, CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            _items.Add(transaction);
            return Task.CompletedTask;
        }

        public Task<IEnumerable<Transaction>> GetAllAsync(CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult<IEnumerable<Transaction>>(_items.ToList());
        }

        public Task<Transaction?> GetByIdAsync(string transactionId, CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult<Transaction?>(_items.FirstOrDefault(t => t.TransactionId.ToString() == transactionId));
        }
    }

    /// <summary>
    /// Fake cache that is never available. It keeps the service on its store
    /// fallback path so the existing (store-only) behaviour is exercised —
    /// matching the contract before the cache integration existed.
    /// </summary>
    private sealed class UnavailableCache : ITransactionCache
    {
        public ValueTask<bool> IsAvailableAsync(CancellationToken ct = default) => ValueTask.FromResult(false);
        public ValueTask<Transaction?> GetCachedAsync(string transactionId, CancellationToken ct = default) => ValueTask.FromResult<Transaction?>(null);
        public ValueTask SetCachedAsync(Transaction transaction, CancellationToken ct = default) => ValueTask.CompletedTask;
        public ValueTask<IReadOnlyList<Transaction>?> GetCachedListAsync(CancellationToken ct = default) => ValueTask.FromResult<IReadOnlyList<Transaction>?>(null);
        public ValueTask SetCachedListAsync(IEnumerable<Transaction> transactions, CancellationToken ct = default) => ValueTask.CompletedTask;
    }

    /// <summary>
    /// Fake broadcaster that records every published transaction and honours
    /// cancellation — lets tests assert that the live push happened after a
    /// successful persist, without a real SignalR client.
    /// </summary>
    private sealed class FakeBroadcaster : ITransactionBroadcaster
    {
        private readonly List<Transaction> _published = new();
        public IReadOnlyList<Transaction> Published => _published;

        public ValueTask<int> BroadcastReceivedAsync(Transaction transaction, CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            _published.Add(transaction);
            return ValueTask.FromResult(1);
        }
    }

    private readonly FakeStore _store = new();
    private readonly ITransactionCache _cache = new UnavailableCache();
    private readonly FakeBroadcaster _broadcaster = new();
    private readonly TransactionService _service;

    public TransactionServiceTests()
    {
        _service = new TransactionService(_store, _cache, _broadcaster, NullLogger<TransactionService>.Instance);
    }

    // 1. Valid payload → Success and persisted in the store.
    [Fact]
    public void Process_ValidPayload_ReturnsSuccessAndPersists()
    {
        var result = Run(Process(_service));

        Assert.True(result.IsSuccess);
        Assert.Equal(ValidId, result.Value!.TransactionId);
        Assert.Single(_store.Saved);
        Assert.Equal(ValidId, _store.Saved[0].TransactionId);
    }

    // 2. Negative amount → Failure (no exception thrown).
    [Fact]
    public void Process_NegativeAmount_ReturnsFailure_NoException()
    {
        var result = Run(Process(_service, ValidId, -1m));

        Assert.True(result.IsFailure);
        Assert.Empty(_store.Saved);
    }

    // 3. Invalid currency length → Failure.
    [Fact]
    public void Process_InvalidCurrencyLength_ReturnsFailure()
    {
        var result = Run(Process(_service, ValidId, ValidAmount, "US"));

        Assert.True(result.IsFailure);
        Assert.Empty(_store.Saved);
    }

    // 4. Empty transactionId → Failure.
    [Fact]
    public void Process_EmptyTransactionId_ReturnsFailure()
    {
        var result = Run(Process(_service, Guid.Empty));

        Assert.True(result.IsFailure);
        Assert.Empty(_store.Saved);
    }

    // 5. Unreasonable timestamp (far future) → Failure.
    [Fact]
    public void Process_FarFutureTimestamp_ReturnsFailure()
    {
        var result = Run(Process(_service, ValidId, ValidAmount, ValidCurrency, ValidStatus, DateTimeOffset.UtcNow.AddYears(100)));

        Assert.True(result.IsFailure);
        Assert.Empty(_store.Saved);
    }

    // 6. GetAllAsync returns the persisted transactions.
    [Fact]
    public void GetAll_AfterSeveralProcesses_ReturnsAllSaved()
    {
        Run(Process(_service));
        Run(Process(_service));

        var result = Run(_service.GetAllAsync(CancellationToken.None));

        Assert.True(result.IsSuccess);
        Assert.Equal(2, result.Value!.Count);
    }

    // 6b. Successful process publishes the transaction to the live channel.
    [Fact]
    public void Process_ValidPayload_PublishesToBroadcaster()
    {
        Run(Process(_service));

        var published = Assert.Single(_broadcaster.Published);
        Assert.Equal(ValidId, published.TransactionId);
    }

    // 6c. Failed process does NOT publish (nothing persisted, nothing broadcast).
    [Fact]
    public void Process_InvalidPayload_DoesNotPublishToBroadcaster()
    {
        Run(Process(_service, ValidId, -1m));

        Assert.Empty(_broadcaster.Published);
    }

    // 7. Cancelled token → documented behavior. Cancellation is an
    //    exceptional/shutdown signal, so it surfaces as OperationCanceledException
    //    (propagated from the store), NOT a Result.Failure. Design decision.
    [Fact]
    public async Task Process_CancelledToken_ThrowsOperationCanceledException()
    {
        var service = new TransactionService(new CancellingStore(), _cache, _broadcaster, NullLogger<TransactionService>.Instance);
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(
            () => service.ProcessAsync(ValidId, ValidAmount, ValidCurrency, ValidStatus, ValidTimestamp, cts.Token));
    }

    /// <summary>Fake store that honours cancellation immediately.</summary>
    private sealed class CancellingStore : ITransactionStore
    {
        public Task AddAsync(Transaction transaction, CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            return Task.CompletedTask;
        }

        public Task<IEnumerable<Transaction>> GetAllAsync(CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult<IEnumerable<Transaction>>(Array.Empty<Transaction>());
        }

        public Task<Transaction?> GetByIdAsync(string transactionId, CancellationToken ct = default)
        {
            ct.ThrowIfCancellationRequested();
            return Task.FromResult<Transaction?>(null);
        }
    }
}
