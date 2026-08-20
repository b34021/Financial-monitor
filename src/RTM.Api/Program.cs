using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using RTM.Api.Caching;
using RTM.Api.Domain;
using RTM.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// Services
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Cache: Redis-first with transparent in-memory fallback (best-effort).
builder.Services.AddCacheProvider(builder.Configuration);

// Transaction store: In-Memory Thread-Safe (ConcurrentDictionary) singleton.
// Singleton so all requests/hub connections share one store instance in this
// real-time context (single-process semantics).
builder.Services.AddSingleton<ITransactionStore, InMemoryTransactionStore>();

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

app.Run();

// expose Program to integration tests (WebApplicationFactory)
public partial class Program;
