using System.Threading;
using System.Threading.Tasks;

namespace RTM.Api.Caching;

/// <summary>
/// Unified cache contract. Implementations are expected to be thread-safe
/// and resilient: a healthy real backend (e.g. Redis) or a transparent
/// in-memory fallback both satisfy the contract without failing callers.
/// </summary>
public interface ICacheProvider
{
    /// <summary>Writes a value under <paramref name="key"/> with an optional TTL.</summary>
    Task SetAsync(string key, string value, TimeSpan? expiry = null, CancellationToken ct = default);

    /// <summary>Reads a raw string value; returns <c>null</c> when absent.</summary>
    Task<string?> GetAsync(string key, CancellationToken ct = default);

    /// <summary>Removes a key (no-op if absent).</summary>
    Task RemoveAsync(string key, CancellationToken ct = default);

    /// <summary>Whether a real, connected backend is currently in use (false => in-memory fallback).</summary>
    bool IsConnected { get; }
}
