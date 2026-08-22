namespace RTM.Api.Caching;

/// <summary>
/// Cache tuning options, bound from the "Cache" configuration section
/// (appsettings.json / env vars). Keeps TTL values out of code — a switchable
/// knob rather than a hardcoded constant.
/// </summary>
public sealed class CacheOptions
{
    /// <summary>
    /// Time-to-live in seconds for the aggregated full-list key ("t:all").
    /// A short TTL is a second line of defense beyond list invalidation: even
    /// if a write-through invalidation were missed, a stale list self-expires
    /// and the next read re-queries the store. Non-positive disables expiry.
    /// </summary>
    public int ListTtlSeconds { get; set; } = 30;
}
