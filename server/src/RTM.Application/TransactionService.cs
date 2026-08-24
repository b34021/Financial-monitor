using Microsoft.Extensions.Logging;
using RTM.Domain;

namespace RTM.Application;

/// <summary>
/// Application-layer service that validates raw inbound transaction data,
/// builds the <see cref="Transaction"/> value object, persists it via the
/// injected <see cref="ITransactionStore"/>, serves reads through a
/// cache-aside / write-through flow driven by the injected
/// <see cref="ITransactionCache"/>, and publishes the persisted transaction to
/// live clients through the injected <see cref="ITransactionBroadcaster"/>.
/// No <c>new</c> of dependencies — all are constructor-injected.
///
/// Validation happens BEFORE constructing the domain object, so invalid
/// payloads are reported as <see cref="Result{T}.Failure"/> without ever
/// throwing. The cache is always best-effort: if it is unavailable, reads fall
/// back to the store and writes are skipped — the store remains the source of
/// truth. The broadcast is also best-effort (see the broadcaster contract):
/// the transaction is persisted first, so a failed/empty push never loses data.
///
/// Cancellation surfaces as <see cref="OperationCanceledException"/> where it
/// cannot be handled as part of the Result flow (documented decision, see
/// PROGRESS.md).
/// </summary>
public sealed class TransactionService : ITransactionService
{
    private readonly ITransactionStore _store;
    private readonly ITransactionCache _cache;
    private readonly ITransactionBroadcaster _broadcaster;
    private readonly ILogger<TransactionService> _logger;

    public TransactionService(
        ITransactionStore store,
        ITransactionCache cache,
        ITransactionBroadcaster broadcaster,
        ILogger<TransactionService> logger)
    {
        _store = store;
        _cache = cache;
        _broadcaster = broadcaster;
        _logger = logger;
    }

    public async Task<Result<Transaction>> ProcessAsync(
        Guid transactionId,
        decimal amount,
        string currency,
        TransactionStatus status,
        DateTimeOffset timestamp,
        CancellationToken ct)
    {
        var validationError = Validate(transactionId, amount, currency, timestamp);
        if (validationError is not null)
            return Result<Transaction>.Failure(validationError);

        // Validated payload — constructor invariants are satisfied.
        var transaction = new Transaction(transactionId, amount, currency, status, timestamp);

        // Source of truth: always persist to the store first. This step honours
        // the caller's cancellation token — it IS the request being processed.
        await _store.AddAsync(transaction, ct);

        // Side-effects AFTER the commit point (single-entry cache refresh, list
        // invalidation, live broadcast) are decoupled from the caller's token.
        // Deliberate decision (documented in PROGRESS.md): once the transaction
        // is safely persisted, the SENDER's request cancelling must not prevent
        // OTHER connected clients from seeing it live, nor leave the cache stale.
        // These are best-effort in the sense that a cache fault is swallowed —
        // but they are NOT abandoned because the originating request disappeared.
        await _cache.SetCachedAsync(transaction, CancellationToken.None).ConfigureAwait(false);
        await _cache.InvalidateListAsync(CancellationToken.None).ConfigureAwait(false);

        var clientCount = await _broadcaster.BroadcastReceivedAsync(transaction, CancellationToken.None).ConfigureAwait(false);
        _logger.LogInformation("Broadcasted transaction {TransactionId} to {ClientCount} client(s).", transaction.TransactionId, clientCount);

        return Result<Transaction>.Success(transaction);
    }

    public async Task<Result<IReadOnlyList<Transaction>>> GetAllAsync(CancellationToken ct)
    {
        // Cache-aside: prefer the full-list cache when available.
        if (await _cache.IsAvailableAsync(ct).ConfigureAwait(false))
        {
            var cached = await _cache.GetCachedListAsync(ct).ConfigureAwait(false);
            if (cached is not null)
                return Result<IReadOnlyList<Transaction>>.Success(cached);
        }

        // Miss (or cache unavailable) → store is the fallback.
        var items = await _store.GetAllAsync(ct).ConfigureAwait(false);
        var snapshot = new List<Transaction>(items);

        // Populate the cache for the next read (best-effort).
        await _cache.SetCachedListAsync(snapshot, ct).ConfigureAwait(false);

        return Result<IReadOnlyList<Transaction>>.Success(snapshot);
    }

    public async Task<Result<IReadOnlyList<Transaction>>> GetLatestAsync(int count, CancellationToken ct)
    {
        // Cache-aside: prefer the full-list cache when available. In a multi-pod
        // deployment with a shared Redis cache (and the SignalR backplane active),
        // the local in-memory store of Pod B may be empty while Pod A populated
        // the cache — so we must look at the shared cache first.
        //
        // The cache holds the full list ("t:all"); we slice it to the N most
        // recent entries. This is the same pattern used by GetAllAsync.
        if (await _cache.IsAvailableAsync(ct).ConfigureAwait(false))
        {
            var cached = await _cache.GetCachedListAsync(ct).ConfigureAwait(false);
            if (cached is not null)
            {
                var latest = cached.OrderByDescending(t => t.Timestamp).Take(count).ToList();
                return Result<IReadOnlyList<Transaction>>.Success(latest);
            }
        }

        // Miss (or cache unavailable) → store is the fallback (capped at
        // MaxTransactions, newest-first).
        var items = await _store.GetLatestAsync(count, ct).ConfigureAwait(false);
        return Result<IReadOnlyList<Transaction>>.Success(new List<Transaction>(items));
    }

    public async Task<Result<Transaction?>> GetByIdAsync(string transactionId, CancellationToken ct)
    {
        // Cache-aside: try the single-entry cache first.
        if (await _cache.IsAvailableAsync(ct).ConfigureAwait(false))
        {
            var cached = await _cache.GetCachedAsync(transactionId, ct).ConfigureAwait(false);
            if (cached is not null)
                return Result<Transaction?>.Success(cached);
        }

        // Miss → store (fallback).
        var found = await _store.GetByIdAsync(transactionId, ct).ConfigureAwait(false);
        if (found is not null)
            await _cache.SetCachedAsync(found, ct).ConfigureAwait(false); // populate

        return Result<Transaction?>.Success(found);
    }

    private static string? Validate(
        Guid transactionId,
        decimal amount,
        string currency,
        DateTimeOffset timestamp)
    {
        if (transactionId == Guid.Empty)
            return "transactionId must be a non-empty GUID.";

        if (amount < 0)
            return "amount must be >= 0.";

        if (string.IsNullOrWhiteSpace(currency) || currency.Length != 3)
            return "currency must be a 3-letter ISO code (e.g. 'USD').";

        // Business rule: reject a far-future timestamp (allow small clock skew).
        var now = DateTimeOffset.UtcNow;
        if (timestamp > now.AddMinutes(5))
            return "timestamp cannot be in the future.";

        return null;
    }
}
