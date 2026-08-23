using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
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
// Optional Redis backplane (ADR-003): when SignalR:UseRedisBackplane=true all
// replicas share one pub/sub channel, so Clients.All reaches pods on the same
// Redis. Default (false) keeps the single-instance in-process hub unchanged.
var useRedisBackplane = builder.Configuration.GetValue<bool>("SignalR:UseRedisBackplane");
var signalrBuilder = builder.Services.AddSignalR();
if (useRedisBackplane)
{
    signalrBuilder.AddStackExchangeRedis(options =>
    {
        var redisConnection = builder.Configuration["SignalR:Redis"] ?? "redis:6379";
        // Parse the "host:port" string into StackExchange ConfigurationOptions
        // (options.Configuration is typed ConfigurationOptions, not a string).
        options.Configuration = StackExchange.Redis.ConfigurationOptions.Parse(redisConnection);
    });
}

// CORS: allow the browser client from the configured origins. AllowCredentials()
// is REQUIRED for SignalR (WebSockets carry cookies/auth), and it forbids
// AllowAnyOrigin — so origins must come from config (Cors:AllowedOrigins), not
// a wildcard. Default: the local Vite dev server.
builder.Services.AddCors(options =>
    options.AddDefaultPolicy(policy => policy
        .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? new[] { "http://localhost:5173" })
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials()));

// Real-time broadcaster: pushes ingested transactions to hub clients. Best-effort
// SignalR-backed implementation lives in the Api layer; the Services layer only
// depends on the Core interface (dependency direction preserved).
builder.Services.AddSingleton<ITransactionBroadcaster, SignalRTransactionBroadcaster>();

// Cache: Redis-first with transparent in-memory fallback (best-effort).
builder.Services.AddCacheProvider(builder.Configuration);

// Cache tuning options (TTL for the aggregated full-list key). Bound from the
// "Cache" section so durations live in config, not code.
builder.Services.Configure<CacheOptions>(builder.Configuration.GetSection("Cache"));

// Transaction cache: adapts the generic cache provider to the transaction-typed
// contract (cache-aside / write-through). Availability follows the underlying
// provider's connection state, so reads fall back to the store when no real
// backend is connected. The list TTL (best-effort self-expiry) is injected from
// config via IOptions.
builder.Services.AddSingleton<ITransactionCache>(sp => new TransactionCache(
    sp.GetRequiredService<ICacheProvider>(),
    sp.GetRequiredService<ILogger<TransactionCache>>(),
    TimeSpan.FromSeconds(sp.GetRequiredService<IOptions<CacheOptions>>().Value.ListTtlSeconds)));

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

// Enable the CORS policy before endpoint routing / the hub mapping so browsers
// are allowed to call the API and open SignalR WebSockets cross-origin.
app.UseCors();

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
