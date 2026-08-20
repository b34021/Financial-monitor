using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RTM.Api.Api;
using RTM.Api.Caching;
using RTM.Api.Domain;
using RTM.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Services
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// JSON: serialize/deserialize TransactionStatus as its string name
// (e.g. "Pending" rather than a numeric code) — friendlier for external clients.
builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new System.Text.Json.Serialization.JsonStringEnumConverter()));

// SignalR: real-time push to live dashboards (the /monitor client).
builder.Services.AddSignalR();

// Real-time broadcaster: pushes ingested transactions to hub clients. Best-effort
// SignalR-backed implementation lives in the Api layer; the Services layer only
// depends on the Core interface (dependency direction preserved).
builder.Services.AddSingleton<ITransactionBroadcaster, SignalRTransactionBroadcaster>();

// Cache: Redis-first with transparent in-memory fallback (best-effort).
builder.Services.AddCacheProvider(builder.Configuration);

// Transaction cache: adapts the generic cache provider to the transaction-typed
// contract (cache-aside / write-through). Availability follows the underlying
// provider's connection state, so reads fall back to the store when no real
// backend is connected.
builder.Services.AddSingleton<ITransactionCache, TransactionCache>();

// Transaction store: In-Memory Thread-Safe (ConcurrentDictionary) singleton.
// Singleton so all requests/hub connections share one store instance in this
// real-time context (single-process semantics).
builder.Services.AddSingleton<ITransactionStore, InMemoryTransactionStore>();

// Application service: validates + persists transactions. Singleton is
// appropriate for this real-time context (all connections share one instance).
builder.Services.AddSingleton<ITransactionService, TransactionService>();

builder.Logging.ClearProviders();
builder.Logging.AddConsole();

var app = builder.Build();

// HTTP pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

// Health probe
app.MapGet("/health", () => Results.Ok(new { status = "ok", timestamp = DateTimeOffset.UtcNow }))
   .WithName("Health")
   .WithOpenApi();

// Ingestion API
app.MapTransactionEndpoints();

// Real-time hub — live dashboard connects here for transaction pushes.
app.MapHub<TransactionHub>("/hubs/transactions");

app.Run();

// expose Program to integration tests (WebApplicationFactory)
public partial class Program;
