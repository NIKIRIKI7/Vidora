using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Ports;

public interface IRenderJobQueue
{
    ValueTask EnqueueAsync(RenderJobId jobId, CancellationToken ct = default);
    IAsyncEnumerable<RenderJobId> DequeueAllAsync(CancellationToken ct = default);
}
