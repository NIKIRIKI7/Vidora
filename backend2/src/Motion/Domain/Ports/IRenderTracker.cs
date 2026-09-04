using MotionContext.Domain.ValueObjects;

namespace MotionContext.Domain.Ports;

public interface IRenderTracker
{
    void Track(string jobId, int renderedFrames, int totalFrames, double currentFps = 0.0);
    bool TryGet(string jobId, out RenderProgressInfo progress);
    void Remove(string jobId);
}
