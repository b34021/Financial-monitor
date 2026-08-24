namespace RTM.Domain;

/// <summary>
/// Store abstraction (Domain layer) for persisting and querying transactions.
/// This is the ONLY data-access surface the Application layer talks to — the
/// concrete implementation (Redis/SQL/In-Memory) is pluggable behind this.
/// </summary>
public interface ITransactionStore
{
    /// <summary>Persist a transaction. Idempotency/duplicate semantics are an implementation detail.</summary>
    Task AddAsync(Transaction transaction, CancellationToken ct);

    /// <summary>Return all stored transactions.</summary>
    Task<IEnumerable<Transaction>> GetAllAsync(CancellationToken ct);

    /// <summary>
    /// Return the most recent <paramref name="count"/> transactions ordered by
    /// their <see cref="Transaction.Timestamp"/> descending — the "latest"
    /// view a fresh dashboard needs, without pulling the whole history.
    /// </summary>
    Task<IEnumerable<Transaction>> GetLatestAsync(int count, CancellationToken ct);

    /// <summary>Return a single transaction by its id (guid-string), or null when missing.</summary>
    Task<Transaction?> GetByIdAsync(string transactionId, CancellationToken ct);
}
