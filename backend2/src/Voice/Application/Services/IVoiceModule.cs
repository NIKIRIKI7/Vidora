using Voice.Application.Commands;
using Voice.Application.Contracts;

namespace Voice.Application.Services;

public interface IVoiceModule
{
    Task<VoiceJobDto> SynthesizeSpeechAsync(SynthesizeSpeechCommand cmd, CancellationToken ct = default);
    Task<BatchVoiceResultDto> BatchSynthesizeAsync(BatchSynthesizeVoiceCommand cmd, CancellationToken ct = default);
    Task<VoiceJobDto> GetJobByIdAsync(string jobId, CancellationToken ct = default);
    Task<DuckedAudioResultDto> ApplyDuckingAsync(ApplyAudioDuckingCommand cmd, CancellationToken ct = default);
    Task<IReadOnlyList<VoiceSpeakerDto>> GetAvailableSpeakersAsync(CancellationToken ct = default);
}
