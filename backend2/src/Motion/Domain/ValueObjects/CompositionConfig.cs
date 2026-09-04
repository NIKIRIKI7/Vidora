using Kernel.Exceptions;

namespace MotionContext.Domain.ValueObjects;

public readonly record struct CompositionConfig
{
    public const int MinResolution = 16;
    public const int MaxResolution = 7680;
    public const int MinFps = 1;
    public const int MaxFps = 120;

    public int Width { get; }
    public int Height { get; }
    public int Fps { get; }
    public int DurationInFrames { get; }

    public double DurationSeconds => Fps > 0 ? Math.Round((double)DurationInFrames / Fps, 3) : 0.0;

    public CompositionConfig(int width, int height, int fps, int durationInFrames)
    {
        if (width is < MinResolution or > MaxResolution)
            throw new ValidationException("width", $"Ширина должна быть от {MinResolution} до {MaxResolution} px.");
        if (height is < MinResolution or > MaxResolution)
            throw new ValidationException("height", $"Высота должна быть от {MinResolution} до {MaxResolution} px.");
        if (fps is < MinFps or > MaxFps)
            throw new ValidationException("fps", $"FPS должен быть от {MinFps} до {MaxFps}.");
        if (durationInFrames <= 0)
            throw new ValidationException("duration_frames", "Длительность сцены в кадрах должна быть строго больше 0.");

        Width = width;
        Height = height;
        Fps = fps;
        DurationInFrames = durationInFrames;
    }

    public static CompositionConfig FromSeconds(int width, int height, int fps, double durationSeconds)
    {
        if (durationSeconds <= 0)
            throw new ValidationException("duration_seconds", "Продолжительность сцены должна быть больше 0 секунд.");

        int frames = (int)Math.Ceiling(durationSeconds * fps);
        return new CompositionConfig(width, height, fps, Math.Max(1, frames));
    }

    public static CompositionConfig FullHdVertical(double durationSeconds, int fps = 30) =>
        FromSeconds(1080, 1920, fps, durationSeconds);

    public static CompositionConfig FullHdLandscape(double durationSeconds, int fps = 30) =>
        FromSeconds(1920, 1080, fps, durationSeconds);
}
