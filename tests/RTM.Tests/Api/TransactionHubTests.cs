using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.SignalR;
using RTM.Api.Api;
using RTM.Api.Domain;
using Xunit;

namespace RTM.Tests.Api;

/// <summary>
/// TDD tests for <see cref="TransactionHub"/>'s on-connect history handoff:
/// when a client connects it must immediately receive the existing transactions
/// (from the cache-backed <see cref="ITransactionService"/>) as an
/// <c>"InitialTransactions"</c> message — not start empty.
/// </summary>
public class TransactionHubTests
{
    private static readonly Guid IdA = new("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static readonly Guid IdB = new("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    private static Transaction Tx(Guid id) =>
        new(id, 10m, "USD", TransactionStatus.Pending, DateTimeOffset.UtcNow);

    /// <summary>
    /// Fake service: returns a pre-seeded history from GetAllAsync (the real
    /// service reads this cache-aside from the cache — out of scope here).
    /// </summary>
    private sealed class FakeService : ITransactionService
    {
        private readonly List<Transaction> _history = new();

        public FakeService(params Transaction[] history) => _history.AddRange(history);

        /// <summary>Throw to guard against the hub invoking the wrong method.</summary>
        public Task<Result<Transaction>> ProcessAsync(
            Guid transactionId, decimal amount, string currency,
            TransactionStatus status, DateTimeOffset timestamp, CancellationToken ct)
            => throw new InvalidOperationException("Hub must not invoke ProcessAsync on connect.");

        public Task<Result<IReadOnlyList<Transaction>>> GetAllAsync(CancellationToken ct)
            => Task.FromResult(Result<IReadOnlyList<Transaction>>.Success((IReadOnlyList<Transaction>)_history.ToList()));

        public Task<Result<Transaction?>> GetByIdAsync(string transactionId, CancellationToken ct)
            => throw new InvalidOperationException("Hub must not invoke GetByIdAsync on connect.");
    }

    /// <summary>
    /// Recording client proxy: captures every SendAsync(method, args) so tests
    /// can assert the method name and payload the hub sends back to the caller.
    /// </summary>
    private sealed class RecordingProxy : IClientProxy
    {
        public string? Method { get; private set; }
        public object?[]? Args { get; private set; }

        public Task SendCoreAsync(string method, object?[] args, CancellationToken ct = default)
        {
            Method = method;
            Args = args;
            return Task.CompletedTask;
        }
    }

    /// <summary>
    /// Minimal <see cref="IHubCallerClients"/> that hands the recording proxy to
    /// the hub for the Caller (the connecting client). Other surfaces aren't
    /// exercised by the on-connect handoff.
    /// </summary>
    private sealed class FakeCallerClients : IHubCallerClients
    {
        private readonly RecordingProxy _proxy;
        public FakeCallerClients(RecordingProxy proxy) => _proxy = proxy;

        public IClientProxy All => _proxy;
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => _proxy;
        public IClientProxy Caller => _proxy;
        public IClientProxy Client(string connectionId) => _proxy;
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => _proxy;
        public IClientProxy Group(string groupName) => _proxy;
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => _proxy;
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => _proxy;
        public IClientProxy Others => _proxy;
        public IClientProxy OthersInGroup(string groupName) => _proxy;
        public IClientProxy User(string userId) => _proxy;
        public IClientProxy Users(IReadOnlyList<string> userIds) => _proxy;
    }

    // 1. On connect, the caller receives "InitialTransactions" populated with the
    //    existing history from the (cache-backed) service — not empty.
    [Fact]
    public async Task OnConnected_ExistingHistory_SendsInitialTransactionsToCaller()
    {
        var hub = new TransactionHub(new FakeService(Tx(IdA), Tx(IdB)));
        var proxy = new RecordingProxy();
        hub.Clients = new FakeCallerClients(proxy);

        await hub.OnConnectedAsync();

        Assert.Equal("InitialTransactions", proxy.Method);
        Assert.NotNull(proxy.Args);
        var list = Assert.IsAssignableFrom<IReadOnlyList<Transaction>>(proxy.Args[0]);
        Assert.Equal(new[] { IdA, IdB }, list.Select(t => t.TransactionId));
    }

    // 2. A client connecting with no persisted history still receives an empty
    //    (but present) InitialTransactions message — the contract is explicit.
    [Fact]
    public async Task OnConnected_NoHistory_SendsEmptyInitialTransactions()
    {
        var hub = new TransactionHub(new FakeService());
        var proxy = new RecordingProxy();
        hub.Clients = new FakeCallerClients(proxy);

        await hub.OnConnectedAsync();

        Assert.Equal("InitialTransactions", proxy.Method);
        Assert.NotNull(proxy.Args);
        var list = Assert.IsAssignableFrom<IReadOnlyList<Transaction>>(proxy.Args[0]);
        Assert.Empty(list);
    }
}
