namespace Research.Domain.Services;

public sealed record BlueOceanEvaluation(
    bool IsBlueOcean,
    double SaturationRatio,
    double CompetitionIndex,
    string AnalysisSummary);

public sealed class BlueOceanDetector
{
    public BlueOceanEvaluation EvaluateTopicCompetition(
        string topic,
        int totalRecentVideos,
        int dominantChannelsCount,
        double aggregateVph)
    {
        bool isSaturated = dominantChannelsCount >= 5;

        double saturationPenalty = Math.Min(1.0, dominantChannelsCount / 5.0);
        double volumeFactor = Math.Clamp(aggregateVph / 2000.0, 0.2, 1.0);
        double competitionIndex = Math.Clamp((1.0 - saturationPenalty) * volumeFactor, 0.05, 1.0);

        bool isBlueOcean = !isSaturated && competitionIndex >= 0.45;
        string summary = isBlueOcean
            ? $"Голубой океан: высокий интерес аудитории ({aggregateVph:F0} VPH) при слабой конкуренции ({dominantChannelsCount} крупных каналов)."
            : $"Красный океан: высокая конкуренция среди лидеров ниши ({dominantChannelsCount} доминирующих каналов). Требуется радикальный разрыв шаблона.";

        return new BlueOceanEvaluation(isBlueOcean, saturationPenalty, Math.Round(competitionIndex, 2), summary);
    }
}
