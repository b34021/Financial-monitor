using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace RTM.Api.Domain;

/// <summary>
/// Application-layer contract (Core): validates raw inbound transaction
/// payload, builds and persists a <see cref="Transaction"/>, and answers
/// queries for all stored transactions. Expected errors (invalid payload)
/// are returned as <see cref="Result{T}.Failure"/> values — never thrown;
/// cancellation surfaces as <see cref="OperationCanceledException"/>.
/// </summary>
public interface ITransactionService
{
    /// <summary>
    /// Validates the raw payload, constructs and persists the transaction.
    /// Invalid input yields <see cref="Result{T}.Failure"/>; success yields
    /// the transaction that was actually saved.
    /// </summary>
    Task<Result<Transaction>> ProcessAsync(
        Guid transactionId,
        decimal amount,
        string currency,
        TransactionStatus status,
        DateTimeOffset timestamp,
        CancellationToken ct);

    /// <summary>Returns all transactions that have been persisted so far.</summary>
    Task<Result<IReadOnlyList<Transaction>>> GetAllAsync(CancellationToken ct);
}
