using System;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using StackExchange.Redis;

namespace RTM.Api.Caching;

/// <summary>
/// Registers the effective cache provider with Redis-first, in-memory-fallback
/// semantics (best-effort). A real connection is attempted with a short timeout;
/// if it fails, an in-memory provider is registered instead and the app keeps
/// running normally — never a hard failure.
/// </summary>
public static class CacheRegistration
{
    public static IServiceCollection AddCacheProvider(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddSingleton<InMemoryCacheProvider>();

        // Redis configuration: "Redis:Configuration" (connection string) + "Redis:Enabled".
        var redisConn = configuration["Redis:Configuration"] ?? "localhost:6379";
        var enabled = configuration.GetValue<bool?>("Redis:Enabled") ?? true;

        if (!enabled)
        {
            services.AddSingleton<ICacheProvider>(sp => sp.GetRequiredService<InMemoryCacheProvider>());
            return services;
        }

        // Best-effort: try to connect once with a short timeout.
        services.AddSingleton<ICacheProvider>(sp =>
        {
            var logger = sp.GetRequiredService<ILoggerFactory>().CreateLogger("CacheSetup");
            var inMemory = sp.GetRequiredService<InMemoryCacheProvider>();

            try
            {
                var options = new ConfigurationOptions
                {
                    AbortOnConnectFail = false,     // don't throw connect errors eagerly
                    ConnectTimeout = 2000,          // short probe
                    EndPoints = { redisConn }
                };
                var multiplexer = ConnectionMultiplexer.Connect(options);

                if (multiplexer.IsConnected)
                {
                    logger.LogInformation("Redis connected ({Conn}); using Redis cache provider.", redisConn);
                    return new RedisCacheProvider(multiplexer,
                        sp.GetRequiredService<ILogger<RedisCacheProvider>>());
                }

                logger.LogWarning("Redis at {Conn} not reachable — using in-memory fallback cache.", redisConn);
                return inMemory;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Unable to reach Redis at {Conn} — using in-memory fallback cache.", redisConn);
                return inMemory;
            }
        });

        return services;
    }
}
