using System.Collections.Concurrent;
using Research.Domain.Ports;

namespace Research.Infrastructure.Caching;

public sealed class InMemoryResearchCacheService : IResearchCacheService
{
    private sealed record CacheEntry(object Value, DateTimeOffset ExpiresAt);
    private readonly ConcurrentDictionary<string, CacheEntry> _cache = new(StringComparer.OrdinalIgnoreCase);

    public Task<T?> GetAsync<T>(string key, CancellationToken ct = default)
    {
        if (_cache.TryGetValue(key, out var entry))
        {
            if (entry.ExpiresAt > DateTimeOffset.UtcNow)
            {
                return Task.FromResult((T?)entry.Value);
            }
            _cache.TryRemove(key, out _);
        }
        return Task.FromResult<T?>(default);
    }

    public Task SetAsync<T>(string key, T value, TimeSpan ttl, CancellationToken ct = default)
    {
        if (value != null)
        {
            _cache[key] = new CacheEntry(value, DateTimeOffset.UtcNow.Add(ttl));
        }
        return Task.CompletedTask;
    }
}
