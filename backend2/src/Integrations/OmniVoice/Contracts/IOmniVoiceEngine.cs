using Voice.Domain.ValueObjects;

namespace Integrations.OmniVoice.Contracts;

public sealed record OmniVoiceSynthesisResult(
    float[] Samples,
    int SampleRate,
    double DurationSeconds,
    long InferenceElapsedMs);

public sealed record OmniVoiceCloneResult(
    string SpeakerId,
    string ProfileBinPath,
    string PreviewAudioPath,
    int EmbeddingDimensions);

public sealed record OmniVoiceDesignResult(
    string SpeakerId,
    string EffectivePrompt,
    string PreviewAudioPath);

public sealed record SpeakerEmbedding(
    string SpeakerId,
    float[] Vector,
    DateTimeOffset CreatedAt);

public interface IOmniVoiceEngine : IDisposable
{
    Task EnsureLoadedAsync(CancellationToken ct = default);

    Task<OmniVoiceSynthesisResult> SynthesizeSpeechAsync(
        string text,
        string speakerId,
        double speed = 1.0,
        double pitch = 1.0,
        int? steps = null,
        double? guidanceScale = null,
        CancellationToken ct = default);

    Task<OmniVoiceSynthesisResult> SynthesizeWithCloneAsync(
        string text,
        string referenceAudioPath,
        string? referenceText = null,
        double speed = 1.0,
        double pitch = 1.0,
        int? steps = null,
        double? guidanceScale = null,
        CancellationToken ct = default);

    Task<OmniVoiceSynthesisResult> SynthesizeWithDesignAsync(
        string text,
        string designPrompt,
        double speed = 1.0,
        double pitch = 1.0,
        int? steps = null,
        double? guidanceScale = null,
        CancellationToken ct = default);

    Task<OmniVoiceCloneResult> CloneVoiceAsync(
        string name,
        string referenceAudioPath,
        string? referenceText = null,
        string? language = null,
        CancellationToken ct = default);

    Task<OmniVoiceDesignResult> DesignVoiceAsync(
        VoiceDesignSpec spec,
        CancellationToken ct = default);

    Task<SpeakerEmbedding> ExtractAndCacheSpeakerEmbeddingAsync(
        string speakerId,
        string referenceAudioPath,
        string? referenceText = null,
        CancellationToken ct = default);

    Task UnloadFromVramAsync(CancellationToken ct = default);

    bool IsModelAvailable();
}