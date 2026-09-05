using Kernel.Exceptions;

namespace Research.Domain.ValueObjects;

public readonly record struct MomentumScore : IComparable<MomentumScore>
{
    public double ViewsPerHour { get; }
    public double OutlierMultiplier { get; }
    public double Score { get; }
    public int MScore { get; }
    public string VelocityStage { get; }
    public string AccelerationPct { get; }
    public double EngagementMultiplier { get; }
    public bool IsRocket { get; }

    public MomentumScore(double viewsPerHour, double outlierMultiplier)
    {
        if (viewsPerHour < 0) throw new ValidationException("views_per_hour", "VPH не может быть отрицательным.");
        if (outlierMultiplier < 0) throw new ValidationException("outlier_multiplier", "Множитель аномалии не может быть отрицательным.");

        ViewsPerHour = Math.Round(viewsPerHour, 1);
        OutlierMultiplier = Math.Round(outlierMultiplier, 2);

        double vphPart = Math.Min(40.0, (ViewsPerHour / 1000.0) * 40.0);
        double outlierPart = Math.Min(60.0, (OutlierMultiplier / 4.0) * 60.0);
        Score = Math.Clamp(Math.Round(vphPart + outlierPart, 1), 0.0, 100.0);

        MScore = (int)Math.Round(Score);
        VelocityStage = IsRocket ? "VIRAL_SURGE" : "STEADY_CLIMBER";
        AccelerationPct = $"+{Math.Round(OutlierMultiplier * 50)}%";
        EngagementMultiplier = 1.0;
        IsRocket = OutlierMultiplier >= 2.5 && ViewsPerHour >= 80.0;
    }

    public MomentumScore(
        double viewsPerHour, double outlierMultiplier, double score,
        int mScore, string velocityStage, string accelerationPct,
        double engagementMultiplier, bool isRocket)
    {
        ViewsPerHour = Math.Round(viewsPerHour, 1);
        OutlierMultiplier = Math.Round(outlierMultiplier, 2);
        Score = score;
        MScore = mScore;
        VelocityStage = velocityStage;
        AccelerationPct = accelerationPct;
        EngagementMultiplier = engagementMultiplier;
        IsRocket = isRocket;
    }

    public static MomentumScore Zero => new(0, 0);

    public bool IsOutlier => IsRocket || OutlierMultiplier >= 2.5 && ViewsPerHour >= 80.0;

    public int CompareTo(MomentumScore other) => Score.CompareTo(other.Score);
    public override string ToString() => $"{Score:F1} (VPH: {ViewsPerHour:F0}, x{OutlierMultiplier:F1}, {VelocityStage})";
}
