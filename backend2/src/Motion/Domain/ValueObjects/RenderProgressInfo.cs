namespace MotionContext.Domain.ValueObjects;

public readonly record struct RenderProgressInfo
{
    public int RenderedFrames { get; }
    public int TotalFrames { get; }
    public double Percentage { get; }
    public double CurrentFps { get; }

    public RenderProgressInfo(int renderedFrames, int totalFrames, double currentFps = 0.0)
    {
        RenderedFrames = Math.Max(0, renderedFrames);
        TotalFrames = Math.Max(0, totalFrames);
        Percentage = TotalFrames > 0
            ? Math.Clamp(Math.Round((double)RenderedFrames / TotalFrames * 100.0, 2), 0.0, 100.0)
            : 0.0;
        CurrentFps = Math.Max(0.0, Math.Round(currentFps, 1));
    }

    public static RenderProgressInfo Initial(int totalFrames) => new(0, totalFrames);
    public static RenderProgressInfo Completed(int totalFrames) => new(totalFrames, totalFrames);
}
