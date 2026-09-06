namespace Research.Domain.ValueObjects;

public readonly record struct RetentionCurve
{
    public IReadOnlyList<RetentionSample> Samples { get; }
    public double AverageIntensity { get; }
    public double DropOffPoint { get; }
    public int DurationSeconds { get; }

    public RetentionCurve(IReadOnlyList<RetentionSample> samples, int durationSeconds)
    {
        Samples = samples;
        DurationSeconds = durationSeconds;
        AverageIntensity = samples.Count > 0 ? samples.Average(s => s.Intensity) : 0;
        DropOffPoint = CalculateDropOff(samples);
    }

    public static RetentionCurve Empty => new([], 0);

    public double GetIntensityAt(double seconds)
    {
        if (Samples.Count == 0 || DurationSeconds == 0) return 0;

        var normalizedPos = seconds / DurationSeconds;
        for (int i = 0; i < Samples.Count - 1; i++)
        {
            if (normalizedPos >= Samples[i].Position && normalizedPos <= Samples[i + 1].Position)
            {
                var t = (normalizedPos - Samples[i].Position) / (Samples[i + 1].Position - Samples[i].Position);
                return Samples[i].Intensity + t * (Samples[i + 1].Intensity - Samples[i].Intensity);
            }
        }

        return Samples.Count > 0 ? Samples[^1].Intensity : 0;
    }

    public bool HasStrongHook(double hookThreshold = 0.8) =>
        Samples.Count > 0 && Samples[0].Intensity >= hookThreshold;

    public double GetEngagementScore() =>
        Samples.Count > 0 ? Samples.Average(s => s.Intensity) * 100.0 : 0;

    private static double CalculateDropOff(IReadOnlyList<RetentionSample> samples)
    {
        if (samples.Count < 2) return 0;

        double maxDrop = 0;
        double dropPoint = 0;
        for (int i = 1; i < samples.Count; i++)
        {
            var drop = samples[i - 1].Intensity - samples[i].Intensity;
            if (drop > maxDrop)
            {
                maxDrop = drop;
                dropPoint = samples[i].Position;
            }
        }
        return dropPoint;
    }
}

public readonly record struct RetentionSample(double Position, double Intensity);
