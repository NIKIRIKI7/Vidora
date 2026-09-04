using System.Collections.Concurrent;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;

namespace MotionContext.Infrastructure.Remotion;

public sealed class RenderTracker : IRenderTracker
{
    private readonly ConcurrentDictionary<string, RenderProgressInfo> _activeRenders = new(StringComparer.OrdinalIgnoreCase);

    public void Track(string jobId, int renderedFrames, int totalFrames, double currentFps = 0.0)
    {
        _activeRenders.AddOrUpdate(
            jobId,
            _ => new RenderProgressInfo(renderedFrames, totalFrames, currentFps),
            (_, _) => new RenderProgressInfo(renderedFrames, totalFrames, currentFps));
    }

    public bool TryGet(string jobId, out RenderProgressInfo progress) =>
        _activeRenders.TryGetValue(jobId, out progress);

    public void Remove(string jobId) =>
        _activeRenders.TryRemove(jobId, out _);
}
