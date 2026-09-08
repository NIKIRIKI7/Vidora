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

    Task<IReadOnlyList<SpeakerProfileDto>> GetAllSpeakersAsync(CancellationToken ct = default);
    Task<SpeakerProfileDto?> GetSpeakerByIdAsync(string id, CancellationToken ct = default);
    Task<SpeakerProfileDto> CreateClonedSpeakerAsync(CloneSpeakerRequest request, string referenceAudioPath, CancellationToken ct = default);
    Task<SpeakerProfileDto> CreateDesignedSpeakerAsync(CreateDesignedSpeakerRequest request, CancellationToken ct = default);
    Task<SpeakerProfileDto> UpdateSpeakerAsync(string id, UpdateSpeakerRequest request, CancellationToken ct = default);
    Task DeleteSpeakerAsync(string id, CancellationToken ct = default);
    Task<VoiceJobDto> GenerateSpeakerPreviewAsync(string id, GeneratePreviewRequest request, CancellationToken ct = default);

    Task<AlignSpeechResponse> AlignSpeechAsync(AlignSpeechRequest request, CancellationToken ct = default);
    Task<string> TranscribeAudioAsync(string audioFilePath, CancellationToken ct = default);
    Task<ProcessAudioDspResponse> ProcessAudioDspAsync(ProcessAudioDspRequest request, CancellationToken ct = default);
    Task<string> ConcatenateAudioAsync(IReadOnlyList<string> audioPaths, string outputPath, CancellationToken ct = default);
    Task<IReadOnlyList<VoiceEngineInfoDto>> GetAvailableEnginesAsync(CancellationToken ct = default);
    Task UnloadVramAsync(CancellationToken ct = default);
}
