using System;
using System.Collections.Concurrent;
using System.Threading;
using System.Threading.Tasks;

namespace RTM.Api.Caching;

/// <summary>
/// Transparent in-memory fallback cache. Used when a real Redis backend is not
/// reachable so the system keeps working (best-effort) with no hard failure.
/// Implementation is thread-safe (<see cref="ConcurrentDictionary{TKey,TValue}"/>)
/// and supports per-entry TTL via an expiry stamp stored alongside the value.
/// </summary>
public sealed class InMemoryCacheProvider : ICacheProvider
{
    private sealed record CacheEntry(string Value, DateTimeOffset? ExpiresAt)
    {
        public bool IsExpired => ExpiresAt.HasValue && ExpiresAt.Value <= DateTimeOffset.UtcNow;
    }

    private readonly ConcurrentDictionary<string, CacheEntry> _items = new();

    public bool IsConnected => false; // in-memory provider never claims a real backend

    public Task SetAsync(string key, string value, TimeSpan? expiry = null, CancellationToken ct = default)
    {
        // honour cancellation contract cheaply
        if (ct.IsCancellationRequested) return Task.FromCanceled(ct);

        var expiresAt = expiry.HasValue ? DateTimeOffset.UtcNow.Add(expiry.Value) : (DateTimeOffset?)null;
        _items[key] = new CacheEntry(value, expiresAt);
        return Task.CompletedTask;
    }

    public Task<string?> GetAsync(string key, CancellationToken ct = default)
    {
        if (ct.IsCancellationRequested) return Task.FromCanceled<string?>(ct);

        if (_items.TryGetValue(key, out var entry))
        {
            if (entry.IsExpired)
            {
                _items.TryRemove(key, out _); // lazy cleanup of stale entry
                return Task.FromResult<string?>(null);
            }
            return Task.FromResult<string?>(entry.Value);
        }
        return Task.FromResult<string?>(null);
    }

    public Task RemoveAsync(string key, CancellationToken ct = default)
    {
        if (ct.IsCancellationRequested) return Task.FromCanceled(ct);

        _items.TryRemove(key, out _);
        return Task.CompletedTask;
    }
}
