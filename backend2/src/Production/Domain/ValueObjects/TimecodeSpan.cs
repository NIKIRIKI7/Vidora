using Kernel.Exceptions;

namespace ProductionContext.Domain.ValueObjects;

public readonly record struct TimecodeSpan
{
    public double StartSeconds { get; }
    public double EndSeconds { get; }
    public double DurationSeconds => Math.Max(0.0, Math.Round(EndSeconds - StartSeconds, 3));

    public TimecodeSpan(double startSeconds, double endSeconds)
    {
        if (startSeconds < 0.0)
        {
            throw new ValidationException("start_seconds", "Время старта не может быть отрицательным.");
        }

        if (endSeconds < startSeconds)
        {
            throw new ValidationException("end_seconds", $"Время окончания ({endSeconds:F3}s) не может быть меньше старта ({startSeconds:F3}s).");
        }

        StartSeconds = Math.Round(startSeconds, 3);
        EndSeconds = Math.Round(endSeconds, 3);
    }

    public static TimecodeSpan FromDuration(double startSeconds, double durationSeconds) =>
        new(startSeconds, startSeconds + Math.Max(0.0, durationSeconds));

    public static TimecodeSpan Zero => new(0.0, 0.0);

    public string ToDisplayString() =>
        $"{FormatSeconds(StartSeconds)} - {FormatSeconds(EndSeconds)} ({DurationSeconds:F2}s)";

    private static string FormatSeconds(double sec) =>
        TimeSpan.FromSeconds(sec).ToString(@"mm\:ss\.fff");

    public override string ToString() => ToDisplayString();
}
