using System;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace RTM.Api.Caching;

/// <summary>
/// Redis-backed cache provider. Wraps a <see cref="ConnectionMultiplexer"/> and
/// degrades gracefully: any runtime Redis failure is logged and treated as a
/// transient miss/ignore so the caller never sees a hard failure from the cache.
/// </summary>
public sealed class RedisCacheProvider : ICacheProvider
{
    private readonly IConnectionMultiplexer _redis;
    private readonly ILogger<RedisCacheProvider> _logger;

    public RedisCacheProvider(IConnectionMultiplexer redis, ILogger<RedisCacheProvider> logger)
    {
        _redis = redis;
        _logger = logger;
    }

    public bool IsConnected => _redis.IsConnected;

    public async Task SetAsync(string key, string value, TimeSpan? expiry = null, CancellationToken ct = default)
    {
        try
        {
            // Optional TimeSpan.When null => no expiry (TimeSpan.Zero). Redis 3.x
            // converts TimeSpan to Expiration via an implicit operator.
            await _redis.GetDatabase().StringSetAsync(key, value, expiry ?? TimeSpan.Zero).WaitAsync(ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Redis SET failed for key {Key}; ignoring (best-effort)", key);
        }
    }

    public async Task<string?> GetAsync(string key, CancellationToken ct = default)
    {
        try
        {
            return await _redis.GetDatabase().StringGetAsync(key).WaitAsync(ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Redis GET failed for key {Key}; returning miss (best-effort)", key);
            return null;
        }
    }

    public async Task RemoveAsync(string key, CancellationToken ct = default)
    {
        try
        {
            await _redis.GetDatabase().KeyDeleteAsync(key).WaitAsync(ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            _logger.LogWarning(ex, "Redis DEL failed for key {Key}; ignoring (best-effort)", key);
        }
    }
}
