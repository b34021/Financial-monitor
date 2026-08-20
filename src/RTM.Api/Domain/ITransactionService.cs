using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace RTM.Api.Domain;

/// <summary>
/// Application-layer contract (Core): validates raw inbound transaction
/// payload, builds and persists a <see cref="Transaction"/>, and answers
/// queries for transactions (cache-aside + store fallback). Expected errors
/// (invalid payload) are returned as <see cref="Result{T}.Failure"/> values —
/// never thrown; cancellation surfaces as <see cref="OperationCanceledException"/>.
/// </summary>
public interface ITransactionService
{
    /// <summary>
    /// Validates the raw payload, constructs and persists the transaction
    /// (write-through to cache). Invalid input yields
    /// <see cref="Result{T}.Failure"/>; success yields the transaction that
    /// was actually saved.
    /// </summary>
    Task<Result<Transaction>> ProcessAsync(
        Guid transactionId,
        decimal amount,
        string currency,
        TransactionStatus status,
        DateTimeOffset timestamp,
        CancellationToken ct);

    /// <summary>Returns all persisted transactions (cache-aside with store fallback).</summary>
    Task<Result<IReadOnlyList<Transaction>>> GetAllAsync(CancellationToken ct);

    /// <summary>Returns a single transaction by id, or <c>null</c> when missing.</summary>
    Task<Result<Transaction?>> GetByIdAsync(string transactionId, CancellationToken ct);
}
