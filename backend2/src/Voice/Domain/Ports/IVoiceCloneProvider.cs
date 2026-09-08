using Voice.Domain.ValueObjects;

namespace Voice.Domain.Ports;

public sealed record CloneVoiceResult(
    string SpeakerId,
    string PreviewAudioPath,
    string? LocalEmbeddingPath = null);

public interface IVoiceCloneProvider
{
    Task<CloneVoiceResult> CloneVoiceAsync(ClonedVoiceSpec spec, CancellationToken ct = default);
    bool SupportsEngine(VoiceEngineType engine);
}
