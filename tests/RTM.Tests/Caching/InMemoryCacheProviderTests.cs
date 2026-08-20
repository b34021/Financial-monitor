using System;
using System.Threading.Tasks;
using RTM.Api.Caching;
using Xunit;

namespace RTM.Tests.Caching;

public class InMemoryCacheProviderTests
{
    // 1. Best-effort: the cache must not throw even when no real Redis is present.
    [Fact]
    public async Task Provider_WorksWithoutRedis_WithInMemoryFallback()
    {
        // Arrange: the fallback provider alone (no Redis anywhere).
        var cache = new InMemoryCacheProvider();

        // Act: basic round-trip that would otherwise throw on a dead backend.
        await cache.SetAsync("tx:1", "{\"id\":\"abc\"}");
        var value = await cache.GetAsync("tx:1");

        // Assert: read back successfully, no exception.
        Assert.NotNull(value);
        Assert.Equal("{\"id\":\"abc\"}", value);
    }

    // 2. Missing key => null (miss), no throw.
    [Fact]
    public async Task Get_MissingKey_ReturnsNull()
    {
        var cache = new InMemoryCacheProvider();

        var value = await cache.GetAsync("does-not-exist");

        Assert.Null(value);
    }

    // 3. Overwrite + remove work correctly.
    [Fact]
    public async Task Set_Remove_ReflectsState()
    {
        var cache = new InMemoryCacheProvider();

        await cache.SetAsync("k", "first");
        await cache.SetAsync("k", "second");
        Assert.Equal("second", await cache.GetAsync("k"));

        await cache.RemoveAsync("k");
        Assert.Null(await cache.GetAsync("k"));
    }

    // 4. TTL expiry causes the entry to vanish on read (lazy cleanup).
    [Fact]
    public async Task Set_WithTtl_ExpiresAfterDelay()
    {
        var cache = new InMemoryCacheProvider();
        await cache.SetAsync("ttl-key", "fresh", expiry: TimeSpan.FromMilliseconds(80));

        var before = await cache.GetAsync("ttl-key");
        Assert.Equal("fresh", before);

        await System.Threading.Tasks.Task.Delay(150);
        var after = await cache.GetAsync("ttl-key");

        Assert.Null(after);
    }

    // 5. Concurrency: many writers sharing one provider must not corrupt data.
    [Fact]
    public async Task ConcurrentWrites_DoNotCorruptState()
    {
        var cache = new InMemoryCacheProvider();
        const int writers = 8;

        await System.Threading.Tasks.Task.WhenAll(
            System.Linq.Enumerable.Range(0, writers).Select(
                i => cache.SetAsync($"key-{i}", $"value-{i}")));

        for (int i = 0; i < writers; i++)
        {
            Assert.Equal($"value-{i}", await cache.GetAsync($"key-{i}"));
        }
    }
}
