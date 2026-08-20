using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging;
using RTM.Api.Domain;

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

    private static Dictionary<string, string[]> ValidateRequest(TransactionRequest request)
    {
        var errors = new Dictionary<string, string[]>();
        var results = new List<ValidationResult>();

        if (!Validator.TryValidateObject(request, new ValidationContext(request), results, validateAllProperties: true))
        {
            foreach (var r in results)
            {
                var member = r.MemberNames is { } names ? string.Join(',', names) : string.Empty;
                errors[member] = new[] { r.ErrorMessage ?? "Invalid value." };
            }
        }

        return errors;
    }
}
