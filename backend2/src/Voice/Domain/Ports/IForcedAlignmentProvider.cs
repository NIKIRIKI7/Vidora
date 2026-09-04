using Voice.Domain.ValueObjects;

namespace Voice.Domain.Ports;

public interface IForcedAlignmentProvider
{
    AlignmentEngineType EngineType { get; }
    Task<AlignmentData> AlignAsync(string audioFilePath, string expectedText, CancellationToken ct = default);
}
