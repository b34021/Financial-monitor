using System;
using System.ComponentModel.DataAnnotations;
using RTM.Api.Domain;

namespace RTM.Api.Api;

/// <summary>
/// Inbound request DTO for the ingestion endpoint. Represents the raw JSON
/// payload (typed loosely at the Api layer); the Service receives these raw
/// values rather than a pre-built entity — the layer boundary is preserved.
///
/// DataAnnotations drive a first structural validation pass (amount range,
/// currency length, required fields) so malformed payloads are rejected early
/// with a 400 — while business rules (e.g. future timestamp) are enforced by
/// <see cref="ITransactionService.ProcessAsync"/>.
/// </summary>
public sealed record TransactionRequest
{
    /// <summary>Globally unique id of the transaction.</summary>
    [Required]
    public Guid? TransactionId { get; init; }

    /// <summary>Monetary amount; must be non-negative.</summary>
    [Required]
    [Range(typeof(decimal), "0", "79228162514264337593543950335", ErrorMessage = "amount must be >= 0.")]
    public decimal? Amount { get; init; }

    /// <summary>3-letter ISO currency code (e.g. 'USD').</summary>
    [Required]
    [StringLength(3, MinimumLength = 3, ErrorMessage = "currency must be a 3-letter ISO code.")]
    public string? Currency { get; init; }

    /// <summary>Lifecycle status (Pending | Completed | Failed).</summary>
    [Required]
    public TransactionStatus? Status { get; init; }

    /// <summary>UTC timestamp (ISO-8601).</summary>
    [Required]
    public DateTimeOffset? Timestamp { get; init; }
}
