using System;
using System.Text.Json.Serialization;

namespace RTM.Api.Domain;

/// <summary>
/// Status lifecycle of a transaction as defined by the JSON data model.
/// </summary>
public enum TransactionStatus
{
    Pending,
    Completed,
    Failed
}

/// <summary>
/// Core transaction entity — mirrors the JSON data model exactly (5 fields):
/// transactionId, amount, currency, status, timestamp (UTC ISO-8601).
/// No merchantId and no extra fields; any addition must be intentional.
/// Value object with a validating constructor to keep instances always valid.
/// </summary>
public sealed class Transaction
{
    public Guid TransactionId { get; }
    public decimal Amount { get; }
    public string Currency { get; }
    public TransactionStatus Status { get; }
    public DateTimeOffset Timestamp { get; }

    /// <summary>
    /// Validating constructor, also used by the JSON serializer when cache
    /// entries are deserialized (parameters drive the mapping by name).
    /// </summary>
    [JsonConstructor]
    public Transaction(
        Guid transactionId,
        decimal amount,
        string currency,
        TransactionStatus status,
        DateTimeOffset timestamp)
    {
        if (!IsValidTransactionId(transactionId))
            throw new ArgumentException("transactionId must be a non-empty GUID.", nameof(transactionId));

        if (amount < 0)
            throw new ArgumentException("amount must be >= 0.", nameof(amount));

        if (string.IsNullOrWhiteSpace(currency) || currency.Length != 3)
            throw new ArgumentException("currency must be a 3-letter ISO code (e.g. 'USD').", nameof(currency));

        if (timestamp == default)
            throw new ArgumentException("timestamp must be a valid date/time.", nameof(timestamp));

        TransactionId = transactionId;
        Amount = amount;
        Currency = currency;
        Status = status;
        Timestamp = timestamp;
    }

    private static bool IsValidTransactionId(Guid id) =>
        id != Guid.Empty;
}
