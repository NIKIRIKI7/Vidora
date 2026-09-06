namespace Research.Domain.ValueObjects;

public readonly record struct ChannelBaselineMetrics
{
    public string ChannelId { get; }
    public double MedianViewsPerVideo { get; }
    public double MedianViewsPerHour { get; }
    public long SubscriberCount { get; }
    public int SampleSize { get; }
    public DateTimeOffset CalculatedAt { get; }

    public ChannelBaselineMetrics(
        string channelId,
        double medianViewsPerVideo,
        double medianViewsPerHour,
        long subscriberCount,
        int sampleSize)
    {
        ChannelId = channelId;
        MedianViewsPerVideo = Math.Round(medianViewsPerVideo, 1);
        MedianViewsPerHour = Math.Round(medianViewsPerHour, 1);
        SubscriberCount = subscriberCount;
        SampleSize = sampleSize;
        CalculatedAt = DateTimeOffset.UtcNow;
    }

    public static ChannelBaselineMetrics Empty => new("", 0, 0, 0, 0);

    public bool IsValid => !string.IsNullOrEmpty(ChannelId) && SampleSize >= 3;

    public double OutlierRatio(double videoViews) =>
        MedianViewsPerVideo > 0 ? videoViews / MedianViewsPerVideo : 1.0;

    public double OutlierRatioVph(double videoVph) =>
        MedianViewsPerHour > 0 ? videoVph / MedianViewsPerHour : 1.0;

    public bool IsOutlier(double videoViews, double outlierThreshold = 3.0) =>
        IsValid && OutlierRatio(videoViews) >= outlierThreshold;

    public bool IsVphOutlier(double videoVph, double outlierThreshold = 3.0) =>
        IsValid && OutlierRatioVph(videoVph) >= outlierThreshold;
}
