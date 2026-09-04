using Voice.Domain.ValueObjects;

namespace Voice.Domain.Ports;

public interface IAudioDuckingService
{
    Task<string> PostProcessVoiceAsync(string inputPath, string outputPath, AudioFilterSpec filterSpec, CancellationToken ct = default);
    Task<string> ApplySidechainDuckingAsync(string voiceAudioPath, string bgmAudioPath, string outputPath, DuckingSpec duckingSpec, CancellationToken ct = default);
}
