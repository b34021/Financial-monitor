using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using RTM.Api.Domain;

namespace RTM.Api.Services;

/// <summary>
/// Application-layer service that validates raw inbound transaction data,
/// builds the <see cref="Transaction"/> value object, persists it via the
/// injected <see cref="ITransactionStore"/>, and serves reads through a
/// cache-aside / write-through flow driven by the injected
/// <see cref="ITransactionCache"/>. No <c>new</c> of dependencies — both are
/// constructor-injected.
///
/// Validation happens BEFORE constructing the domain object, so invalid
/// payloads are reported as <see cref="Result{T}.Failure"/> without ever
/// throwing. The cache is always best-effort: if it is unavailable, reads fall
/// back to the store and writes are skipped — the store remains the source of
/// truth. Cancellation surfaces as <see cref="OperationCanceledException"/>
/// (documented design decision, see PROGRESS.md).
/// </summary>
public sealed class TransactionService : ITransactionService
{
    private readonly ITransactionStore _store;
    private readonly ITransactionCache _cache;

    public TransactionService(ITransactionStore store, ITransactionCache cache)
    {
        _store = store;
        _cache = cache;
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

        // Source of truth: always persist to the store first.
        await _store.AddAsync(transaction, ct);

        // Write-through: best-effort refresh of the single-entry cache. The
        // full-list cache is stale by design; it is repopulated lazily by reads.
        await _cache.SetCachedAsync(transaction, ct).ConfigureAwait(false);

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
