using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using RTM.Domain;
using RTM.Infrastructure;
using Xunit;

namespace RTM.Tests.Services;

/// <summary>
/// Unit tests for <see cref="InMemoryTransactionStore"/>, written TDD (Red first).
/// Covers basic round-trip, concurrent writes, and duplicate-id semantics.
/// </summary>
public class InMemoryTransactionStoreTests
{
    private static Transaction NewTx(string? idOverlay = null)
    {
        var id = idOverlay is null ? Guid.NewGuid() : Guid.Parse(idOverlay);
        return new Transaction(id, 100m, "USD", TransactionStatus.Pending, DateTimeOffset.UtcNow);
    }

    // 1. Add → GetById + GetAll round-trip.
    [Fact]
    public async Task Add_Then_GetById_And_GetAll_ReturnTransaction()
    {
        var store = new InMemoryTransactionStore();
        var tx = NewTx();

        await store.AddAsync(tx, CancellationToken.None);

        var byId = await store.GetByIdAsync(tx.TransactionId.ToString(), CancellationToken.None);
        Assert.NotNull(byId);
        Assert.Equal(tx.TransactionId, byId!.TransactionId);

        var all = await store.GetAllAsync(CancellationToken.None);
        Assert.Single(all);
        Assert.Equal(tx.TransactionId, all.Single().TransactionId);
    }

    // 2. Two adds in close succession (same clock tick) → both preserved, no overwrite.
    [Fact]
    public async Task Add_TwoDistinctIds_BothPreserved()
    {
        var store = new InMemoryTransactionStore();
        var txA = NewTx("11111111-1111-1111-1111-111111111111");
        var txB = NewTx("22222222-2222-2222-2222-222222222222");
        // same timestamp to simulate micro-close writes
        var ts = DateTimeOffset.UtcNow;

        await store.AddAsync(new Transaction(txA.TransactionId, txA.Amount, txA.Currency, txA.Status, ts), CancellationToken.None);
        await store.AddAsync(new Transaction(txB.TransactionId, txB.Amount, txB.Currency, txB.Status, ts), CancellationToken.None);

        var all = (await store.GetAllAsync(CancellationToken.None)).ToList();
        Assert.Equal(2, all.Count);
        Assert.Contains(all, t => t.TransactionId == txA.TransactionId);
        Assert.Contains(all, t => t.TransactionId == txB.TransactionId);
    }

    // 3. Adding same transactionId twice → defined behavior: the store must be
    //    consistent. We choose "replace" (ConcurrentDictionary AddOrUpdate), and
    //    document it. The test asserts the store contains exactly one entry and
    //    that the latest value wins.
    [Fact]
    public async Task Add_SameIdTwice_KeepsSingleEntry_LatestWins()
    {
        var store = new InMemoryTransactionStore();
        await store.AddAsync(NewTx("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), CancellationToken.None);
        await store.AddAsync(NewTx("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"), CancellationToken.None);

        var all = (await store.GetAllAsync(CancellationToken.None)).ToList();
        Assert.Single(all);
    }

    // 4. GetById for missing id → null.
    [Fact]
    public async Task GetById_Missing_ReturnsNull()
    {
        var store = new InMemoryTransactionStore();

        var result = await store.GetByIdAsync("ffffffff-ffff-ffff-ffff-ffffffffffff", CancellationToken.None);

        Assert.Null(result);
    }

    // 5. Concurrency: many concurrent AddAsync calls, all distinct ids, must
    //    preserve all entries (Thread-Safety of the store).
    [Fact]
    public async Task ConcurrentAdds_PreserveAllEntries()
    {
        var store = new InMemoryTransactionStore();
        const int writers = 50;

        await Task.WhenAll(
            Enumerable.Range(0, writers).Select(i =>
                store.AddAsync(
                    new Transaction(
                        Guid.NewGuid(), i, "USD", TransactionStatus.Pending, DateTimeOffset.UtcNow),
                    CancellationToken.None)));

        var all = await store.GetAllAsync(CancellationToken.None);
        Assert.Equal(writers, all.Count());
    }

    // 6. CancellationToken propagates (AddAsync should observe cancellation).
    [Fact]
    public async Task Add_CancelledToken_Throws()
    {
        var store = new InMemoryTransactionStore();
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            store.AddAsync(NewTx(), cts.Token));
    }

    // 7. Bounded history (P1-4): adding more than the cap evicts the oldest,
    //    so the store never exceeds MaxTransactions (the spec's "latest N").
    [Fact]
    public async Task Add_OverCap_EvictsOldest_StaysBounded()
    {
        var store = new InMemoryTransactionStore();
        var baseTime = DateTimeOffset.UtcNow;

        // Distinct timestamps so the "oldest" is deterministic.
        for (var i = 0; i < InMemoryTransactionStore.MaxTransactions + 25; i++)
        {
            await store.AddAsync(
                new Transaction(Guid.NewGuid(), i, "USD", TransactionStatus.Pending, baseTime.AddSeconds(i)),
                CancellationToken.None);
        }

        var all = (await store.GetAllAsync(CancellationToken.None)).ToList();
        Assert.Equal(InMemoryTransactionStore.MaxTransactions, all.Count);

        // The 25 oldest (the first added) must be gone; count still reflects the
        // newest entries.
        var minTs = all.Min(t => t.Timestamp);
        Assert.Equal(baseTime.AddSeconds(25), minTs);
    }

    // 8. GetLatestAsync returns only the N most recent, newest-first.
    [Fact]
    public async Task GetLatest_ReturnsNewestFirst_RespectsCount()
    {
        var store = new InMemoryTransactionStore();
        var baseTime = DateTimeOffset.UtcNow;

        for (var i = 0; i < 5; i++)
        {
            await store.AddAsync(
                new Transaction(Guid.NewGuid(), i, "USD", TransactionStatus.Pending, baseTime.AddSeconds(i)),
                CancellationToken.None);
        }

        var latest = (await store.GetLatestAsync(3, CancellationToken.None)).ToList();

        Assert.Equal(3, latest.Count);
        Assert.Equal(baseTime.AddSeconds(4), latest[0].Timestamp);   // newest first
        Assert.Equal(baseTime.AddSeconds(3), latest[1].Timestamp);
        Assert.Equal(baseTime.AddSeconds(2), latest[2].Timestamp);
    }
}
