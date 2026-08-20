using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace RTM.Api.Domain;

/// <summary>
/// Store abstraction (Core layer) for persisting and querying transactions.
/// This is the ONLY data-access surface the Services layer talks to — the
/// concrete implementation (Redis/SQL/In-Memory) is pluggable behind this.
/// </summary>
public interface ITransactionStore
{
    /// <summary>Persist a transaction. Idempotency/duplicate semantics are an implementation detail.</summary>
    Task AddAsync(Transaction transaction, CancellationToken ct);

    /// <summary>Return all stored transactions.</summary>
    Task<IEnumerable<Transaction>> GetAllAsync(CancellationToken ct);

    /// <summary>Return a single transaction by its id (guid-string), or null when missing.</summary>
    Task<Transaction?> GetByIdAsync(string transactionId, CancellationToken ct);
}
