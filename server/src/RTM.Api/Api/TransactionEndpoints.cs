using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging;
using RTM.Domain;

namespace RTM.Api.Api;

/// <summary>
/// Minimal-API endpoint definitions for transaction ingestion.
/// Follows the layered architecture: the Api layer only marshals between HTTP
/// and the injected <see cref="ITransactionService"/> — no domain construction
/// here and no direct touch of the store/cache (all via the service).
/// </summary>
public static class TransactionEndpoints
{
    public static IEndpointRouteBuilder MapTransactionEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapPost("/api/transactions", HandleIngestAsync)
           .WithName("IngestTransaction")
           .Produces<Transaction>(StatusCodes.Status201Created)
           .ProducesValidationProblem()
           .WithOpenApi();

        // List + single-object reads. The service already exposes these (and they
        // are covered by unit tests) — this endpoint set simply surfaces them,
        // and makes the Location header of the POST resolve to a live URL.
        app.MapGet("/api/transactions", HandleListAsync)
           .WithName("GetTransactions")
           .Produces<IEnumerable<Transaction>>(StatusCodes.Status200OK)
           .ProducesProblem(StatusCodes.Status400BadRequest)
           .WithOpenApi();

        app.MapGet("/api/transactions/{id}", HandleGetByIdAsync)
           .WithName("GetTransactionById")
           .Produces<Transaction>(StatusCodes.Status200OK)
           .Produces(StatusCodes.Status404NotFound)
           .ProducesProblem(StatusCodes.Status400BadRequest)
           .WithOpenApi();

        return app;
    }

    private static async Task<IResult> HandleIngestAsync(
        TransactionRequest request,
        ITransactionService service,
        ILogger<TransactionRequest> logger,
        CancellationToken ct)
    {
        logger.LogInformation("Ingestion request received for transaction {TransactionId}.", request.TransactionId);

        // Structural validation pass (DataAnnotations): reject malformed
        // payloads before touching the service. Missing fields / invalid
        // amounts / bad currency length → 400 ValidationProblem.
        var validationErrors = ValidateRequest(request);
        if (validationErrors.Count > 0)
        {
            logger.LogWarning("Ingestion request failed model validation with {ErrorCount} error(s).", validationErrors.Count);
            return Results.ValidationProblem(validationErrors);
        }

        // Business validation + persistence happen in the service.
        var result = await service.ProcessAsync(
            request.TransactionId!.Value,
            request.Amount!.Value,
            request.Currency!,
            request.Status!.Value,
            request.Timestamp!.Value,
            ct);

        if (result.IsSuccess)
        {
            var tx = result.Value!;
            logger.LogInformation("Ingested transaction {TransactionId}.", tx.TransactionId);
            return Results.Created($"/api/transactions/{tx.TransactionId}", tx);
        }

        logger.LogWarning("Ingestion rejected for transaction {TransactionId}: {Error}.", request.TransactionId, result.Error);
        return Results.BadRequest(new { error = result.Error });
    }

    private static async Task<IResult> HandleListAsync(
        ITransactionService service,
        ILogger<TransactionRequest> logger,
        CancellationToken ct)
    {
        var result = await service.GetAllAsync(ct).ConfigureAwait(false);
        if (result.IsSuccess)
            return Results.Ok(result.Value);

        logger.LogWarning("List query failed: {Error}.", result.Error);
        return Results.BadRequest(new { error = result.Error });
    }

    private static async Task<IResult> HandleGetByIdAsync(
        string id,
        ITransactionService service,
        ILogger<TransactionRequest> logger,
        CancellationToken ct)
    {
        var result = await service.GetByIdAsync(id, ct).ConfigureAwait(false);
        if (result.IsSuccess)
            return result.Value is { } tx ? Results.Ok(tx) : Results.NotFound();

        logger.LogWarning("Get-by-id query failed for {Id}: {Error}.", id, result.Error);
        return Results.BadRequest(new { error = result.Error });
    }

    private static Dictionary<string, string[]> ValidateRequest(TransactionRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var results = new List<ValidationResult>();

        if (!Validator.TryValidateObject(request, new ValidationContext(request), results, validateAllProperties: true))
        {
            foreach (var r in results)
            {
                // Object-level validation results have no member name; fall back to a
                // stable dummy key so the error surfaces instead of a nameless "" key.
                var member = r.MemberNames is { } names && names.Any() ? string.Join(',', names) : nameof(TransactionRequest);
                // Multiple results for the same member share one key → aggregate messages.
                if (!errors.TryAdd(member, new[] { r.ErrorMessage ?? "Invalid value." }))
                    errors[member] = errors[member].Append(r.ErrorMessage ?? "Invalid value.").ToArray();
            }
        }

        return errors;
    }
}
