using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using RTM.Api.Domain;

namespace RTM.Api.Services;

/// <summary>
/// Application-layer service that validates raw inbound transaction data,
/// builds the <see cref="Transaction"/> value object, and persists it via the
/// injected <see cref="ITransactionStore"/>. No <c>new</c> of dependencies —
/// the store is constructor-injected.
///
/// Validation happens BEFORE constructing the domain object, so invalid
/// payloads are reported as <see cref="Result{T}.Failure"/> without ever
/// throwing. Cancellation surfaces as <see cref="OperationCanceledException"/>
/// (documented design decision, see PROGRESS.md).
/// </summary>
public sealed class TransactionService : ITransactionService
{
    private readonly ITransactionStore _store;

    public TransactionService(ITransactionStore store)
    {
        _store = store;
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

        await _store.AddAsync(transaction, ct);
        return Result<Transaction>.Success(transaction);
    }

    public async Task<Result<IReadOnlyList<Transaction>>> GetAllAsync(CancellationToken ct)
    {
        var items = await _store.GetAllAsync(ct);
        var snapshot = new List<Transaction>(items);
        return Result<IReadOnlyList<Transaction>>.Success(snapshot);
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
