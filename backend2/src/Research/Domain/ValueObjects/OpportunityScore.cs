using Kernel.Exceptions;

namespace Research.Domain.ValueObjects;

public readonly record struct OpportunityScore : IComparable<OpportunityScore>
{
    public double Value { get; }
    public double DemandVelocity { get; }
    public double CompetitionIndex { get; }
    public double ViralConfidence { get; }

    public OpportunityScore(double demandVelocity, double competitionIndex, double viralConfidence)
    {
        if (demandVelocity < 0)
        {
            throw new ValidationException("demand_velocity", "Скорость спроса не может быть отрицательной.");
        }

        if (competitionIndex is < 0.0 or > 1.0)
        {
            throw new ValidationException("competition_index", "Индекс конкуренции должен быть от 0.0 (насыщен) до 1.0 (голубой океан).");
        }

        if (viralConfidence is < 0.0 or > 1.0)
        {
            throw new ValidationException("viral_confidence", "Уверенность виральности должна быть в диапазоне 0.0..1.0.");
        }

        DemandVelocity = Math.Round(demandVelocity, 2);
        CompetitionIndex = Math.Round(competitionIndex, 2);
        ViralConfidence = Math.Round(viralConfidence, 2);

        double raw = (DemandVelocity * 0.4) + (CompetitionIndex * 100.0 * 0.4) + (ViralConfidence * 100.0 * 0.2);
        Value = Math.Clamp(Math.Round(raw, 1), 0.0, 100.0);
    }

    public static OpportunityScore Create(double demand, double competition, double confidence) =>
        new(demand, competition, confidence);

    public int CompareTo(OpportunityScore other) => Value.CompareTo(other.Value);
    public override string ToString() => $"{Value:F1}/100 [BlueOcean: {CompetitionIndex:P0}, Conf: {ViralConfidence:P0}]";
}
