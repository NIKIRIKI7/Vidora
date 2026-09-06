using Research.Domain.ValueObjects;

namespace Research.Domain.Services;

public sealed class MomentumEngine
{
    public const double OutlierThresholdMultiplier = 2.5;
    public const double MinCandidateVph = 50.0;

    public MomentumScore CalculateMomentum(
        long views, DateTimeOffset publishedAt, long subscriberCount, DateTimeOffset? referenceNow = null)
    {
        var now = referenceNow ?? DateTimeOffset.UtcNow;
        var ageHours = Math.Max(0.5, (now - publishedAt).TotalHours);
        double ratio = subscriberCount > 0 ? (double)views / subscriberCount : 1.5;
        return CalculateDynamicMomentum(views, ageHours, ratio: ratio);
    }

    public MomentumScore CalculateMomentum(
        long views, DateTimeOffset publishedAt, long subscriberCount,
        ChannelBaselineMetrics? baseline, DateTimeOffset? referenceNow = null)
    {
        var now = referenceNow ?? DateTimeOffset.UtcNow;
        var ageHours = Math.Max(0.5, (now - publishedAt).TotalHours);
        double ratio = subscriberCount > 0 ? (double)views / subscriberCount : 1.5;

        var baseScore = CalculateDynamicMomentum(views, ageHours, ratio: ratio);

        if (baseline is { IsValid: true } bl)
        {
            var baselineBoost = bl.OutlierRatio(views);
            if (baselineBoost >= 2.0)
            {
                var boostedScore = baseScore.MScore + (int)Math.Round(baselineBoost * 10);
                return new MomentumScore(
                    baseScore.ViewsPerHour,
                    Math.Max(baseScore.OutlierMultiplier, baselineBoost),
                    baseScore.Score,
                    Math.Min(100, boostedScore),
                    baseScore.VelocityStage,
                    $"+{Math.Max(int.Parse(baseScore.AccelerationPct.Trim('%', '+')), (int)Math.Round(baselineBoost * 50))}%",
                    baseScore.EngagementMultiplier,
                    baseScore.IsRocket || baselineBoost >= 4.0);
            }
        }

        return baseScore;
    }

    public MomentumScore CalculateDynamicMomentum(
        long views, double hoursAlive, long likes = 0, long comments = 0, double ratio = 1.0)
    {
        double v = Math.Max(1.0, views);
        double h = Math.Max(0.5, hoursAlive);
        double l = Math.Max(0, likes == 0 ? (long)(v * 0.04) : likes);
        double c = Math.Max(0, comments == 0 ? (long)(v * 0.005) : comments);
        double r = Math.Max(0.1, ratio);

        double timeDecay = Math.Pow(h + 0.5, 1.18);
        double baseVelocity = v / timeDecay;

        double rawEngagement = (l * 12.0 + c * 30.0) / (v + 1.0);
        double eMult = 1.0 + Math.Min(4.0, rawEngagement);
        double ratioBoost = Math.Sqrt(r);

        double kFreshness = 1.0;
        if (h <= 12.0 && r >= 2.0) kFreshness = 2.5;
        else if (h <= 48.0 && r >= 1.5) kFreshness = 1.5;

        double mScoreRaw = baseVelocity * eMult * ratioBoost * kFreshness;
        int mScore = (int)Math.Round(mScoreRaw);

        double linearVph = v / h;
        int accelRatio = (int)Math.Round((baseVelocity / Math.Max(1.0, linearVph)) * 100 * kFreshness);
        string accelStr = accelRatio > 0 ? $"+{accelRatio}%" : $"{accelRatio}%";

        string stage;
        bool isRocket;

        if ((h <= 18.0 && mScore >= 500 && r >= 2.0) || (h <= 8.0 && mScore >= 250 && r >= 2.0))
        {
            stage = "ROCKET_IGNITION";
            isRocket = true;
            accelStr = $"+{Math.Max(350, accelRatio * 2)}%";
        }
        else if ((h <= 72.0 && mScore >= 180 && r >= 1.5) || (mScore >= 180 && r >= 1.5))
        {
            stage = "VIRAL_SURGE";
            isRocket = true;
            accelStr = $"+{Math.Max(150, accelRatio)}%";
        }
        else if (r >= 1.3 && linearVph >= 150)
        {
            stage = "STEADY_CLIMBER";
            isRocket = false;
        }
        else
        {
            stage = "SATURATED_LEGACY";
            isRocket = false;
        }

        double approxSubs = Math.Max(1.0, v / Math.Max(0.1, r));
        double outlierRatio = v / Math.Max(20.0, (approxSubs * 0.01) / 48.0);
        double legacyScore = Math.Clamp(Math.Round((v / timeDecay / 1000.0) * 40.0 + (outlierRatio / 4.0) * 60.0, 1), 0.0, 100.0);

        return new MomentumScore(
            viewsPerHour: linearVph,
            outlierMultiplier: outlierRatio,
            score: legacyScore,
            mScore: mScore,
            velocityStage: stage,
            accelerationPct: accelStr,
            engagementMultiplier: eMult,
            isRocket: isRocket);
    }

    public bool IsVelocityOutlier(MomentumScore momentum)
    {
        return momentum.IsRocket || momentum.OutlierMultiplier >= OutlierThresholdMultiplier && momentum.ViewsPerHour >= MinCandidateVph;
    }
}
