using Voice.Domain.ValueObjects;

namespace Voice.Domain.Ports;

public sealed record DesignVoiceResult(
    string SpeakerId,
    string Description,
    string? PreviewAudioPath);

public interface IVoiceDesignProvider
{
    Task<DesignVoiceResult> DesignVoiceAsync(VoiceDesignSpec spec, CancellationToken ct = default);
}
