using System;
using System.Net;
using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace RTM.Tests.Api;

/// <summary>
/// Integration tests for the ingestion endpoint (<c>POST /api/transactions</c>).
/// A single shared <see cref="WebApplicationFactory{TEntryPoint}"/> boots the real
/// <c>Program</c> host once; all tests exercise the same server over HTTP.
/// </summary>
public class TransactionIngestionApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public TransactionIngestionApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory;
    }

    private static readonly Guid SampleId = new("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

    private HttpClient CreateClient() => _factory.CreateClient();

    private static StringContent Json(object payload) =>
        new(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");

    private static object ValidPayload(Guid? id = null) => new
    {
        transactionId = (id ?? SampleId).ToString(),
        amount = 100.5m,
        currency = "USD",
        status = "Pending",
        timestamp = DateTimeOffset.UtcNow
    };

    // a. Valid POST → 201 Created, body transactionId echoes the sent id.
    [Fact]
    public async Task Post_ValidPayload_Returns201AndEchoesId()
    {
        using var client = CreateClient();

        var response = await client.PostAsync("/api/transactions", Json(ValidPayload()));

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var transactionId = doc.RootElement.GetProperty("transactionId").GetString();
        Assert.Equal(SampleId.ToString(), transactionId);
    }

    // b. Negative amount → 400.
    [Fact]
    public async Task Post_NegativeAmount_Returns400()
    {
        using var client = CreateClient();
        var payload = new
        {
            transactionId = SampleId.ToString(),
            amount = -1m,
            currency = "USD",
            status = "Pending",
            timestamp = DateTimeOffset.UtcNow
        };

        var response = await client.PostAsync("/api/transactions", Json(payload));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // c. Currency not exactly 3 chars → 400.
    [Fact]
    public async Task Post_InvalidCurrencyLength_Returns400()
    {
        using var client = CreateClient();
        var payload = new
        {
            transactionId = SampleId.ToString(),
            amount = 100m,
            currency = "US",        // too short
            status = "Pending",
            timestamp = DateTimeOffset.UtcNow
        };

        var response = await client.PostAsync("/api/transactions", Json(payload));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // d. Empty/blank body (missing required fields) → 400 validation.
    [Fact]
    public async Task Post_MissingFields_Returns400()
    {
        using var client = CreateClient();

        var response = await client.PostAsync("/api/transactions", Json(new { }));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    // e. SignalR hub is registered and mapped: WebSocket negotiation endpoint
    //    answers 200 with a connection payload (no live client needed). Configure
    //    JSON body so the negotiate request is well-formed.
    [Fact]
    public async Task Hub_Negotiate_ReturnsConnection()
    {
        using var client = CreateClient();

        var response = await client.PostAsync(
            "/hubs/transactions/negotiate?negotiateVersion=1",
            new StringContent("{}", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Contains("connectionId", doc.RootElement.EnumerateObject()
            .Select(p => p.Name), StringComparer.OrdinalIgnoreCase);
    }

    // f. GET /api/transactions lists a transaction that was just ingested.
    //    (The store is a singleton across the fixture, so we assert membership
    //    of the id we just posted, not a precise count.)
    [Fact]
    public async Task Get_AfterPost_ListsTheTransaction()
    {
        using var client = CreateClient();
        var id = Guid.NewGuid();

        await client.PostAsync("/api/transactions", Json(ValidPayload(id)));
        var response = await client.GetAsync("/api/transactions");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var ids = doc.RootElement.EnumerateArray()
            .Select(e => e.GetProperty("transactionId").GetString())
            .ToArray();
        Assert.Contains(id.ToString(), ids);
    }

    // g. The Location header the POST returns resolves to a live GET endpoint
    //    (200), so a Swagger "follow the link" click works.
    [Fact]
    public async Task Post_LocationHeader_ResolvesToGetById()
    {
        using var client = CreateClient();
        var id = Guid.NewGuid();

        var post = await client.PostAsync("/api/transactions", Json(ValidPayload(id)));
        var location = post.Headers.Location;
        Assert.NotNull(location);

        // Location is a relative URI (/api/transactions/{id}); use its string as
        // the path for the follow-up GET.
        var get = await client.GetAsync(location.ToString());
        Assert.Equal(HttpStatusCode.OK, get.StatusCode);
        using var doc = JsonDocument.Parse(await get.Content.ReadAsStringAsync());
        Assert.Equal(id.ToString(), doc.RootElement.GetProperty("transactionId").GetString());
    }

    // h. GET /api/transactions/{missing} → 404.
    [Fact]
    public async Task Get_UnknownId_Returns404()
    {
        using var client = CreateClient();

        var response = await client.GetAsync($"/api/transactions/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
