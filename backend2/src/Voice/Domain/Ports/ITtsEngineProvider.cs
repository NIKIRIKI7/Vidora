using Voice.Domain;
using Voice.Domain.ValueObjects;

namespace Voice.Domain.Ports;

public sealed record RawSynthesisResult(
    string AudioFilePath,
    double DurationSeconds,
    long FileSizeBytes,
    AlignmentData? NativeAlignment = null);

public interface ITtsEngineProvider
{
    VoiceEngineType EngineType { get; }
    Task<RawSynthesisResult> SynthesizeAsync(string text, VoiceSpec spec, string destinationPath, CancellationToken ct);
}
