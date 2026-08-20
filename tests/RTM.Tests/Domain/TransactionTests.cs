using System;
using RTM.Api.Domain;
using Xunit;

namespace RTM.Tests.Domain;

public class TransactionTests
{
    private static Guid ValidId => Guid.NewGuid();

    [Fact]
    public void ValidTransaction_BuildsSuccessfully()
    {
        // Act
        var tx = new Transaction(
            ValidId,
            amount: 1500.50m,
            currency: "USD",
            status: TransactionStatus.Completed,
            timestamp: DateTimeOffset.Parse("2024-01-15T10:00:00Z"));

        // Assert
        Assert.Equal(1500.50m, tx.Amount);
        Assert.Equal("USD", tx.Currency);
        Assert.Equal(TransactionStatus.Completed, tx.Status);
        Assert.Equal(DateTimeOffset.Parse("2024-01-15T10:00:00Z"), tx.Timestamp);
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(-5)]
    [InlineData(-1000)]
    public void NegativeAmount_IsRejected(decimal amount)
    {
        // Act + Assert
        Assert.Throws<ArgumentException>(() =>
            new Transaction(ValidId, amount, "USD", TransactionStatus.Pending, DateTimeOffset.UtcNow));
    }

    [Theory]
    [InlineData("US")]        // 2 letters
    [InlineData("USDC")]      // 4 letters
    [InlineData("")]          // empty
    [InlineData("  ")]        // whitespace
    public void CurrencyWithInvalidLength_IsRejected(string currency)
    {
        // Act + Assert
        Assert.Throws<ArgumentException>(() =>
            new Transaction(ValidId, 10m, currency, TransactionStatus.Pending, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void EmptyTransactionId_IsRejected()
    {
        // Act + Assert
        Assert.Throws<ArgumentException>(() =>
            new Transaction(Guid.Empty, 10m, "USD", TransactionStatus.Pending, DateTimeOffset.UtcNow));
    }

    [Theory]
    [InlineData(TransactionStatus.Pending)]
    [InlineData(TransactionStatus.Completed)]
    [InlineData(TransactionStatus.Failed)]
    public void AllEnumStatuses_AreValid(TransactionStatus status)
    {
        // Act
        var tx = new Transaction(ValidId, 10m, "USD", status, DateTimeOffset.UtcNow);

        // Assert
        Assert.Equal(status, tx.Status);
    }

    [Fact]
    public void ValidZeroAmount_IsAccepted()
    {
        // amount >= 0 (zero allowed)
        var tx = new Transaction(ValidId, 0m, "USD", TransactionStatus.Pending, DateTimeOffset.UtcNow);
        Assert.Equal(0m, tx.Amount);
    }
}
