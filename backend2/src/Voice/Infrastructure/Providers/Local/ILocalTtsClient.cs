using System.Text.Json.Serialization;

namespace Voice.Infrastructure.Providers.Local;

public sealed record LocalTtsEngineDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("capabilities")] IReadOnlyList<string> Capabilities);

/// <summary>
/// HTTP-контракт к локальному ML-воркеру (python_services/tts_engine).
/// Работает через абсолютные пути к файлам на общем диске (stateless-принцип).
/// </summary>
public interface ILocalTtsClient
{
    Task<IReadOnlyList<LocalTtsEngineDto>> GetAvailableModelsAsync(CancellationToken ct = default);

    Task SynthesizeAsync(
        string engineId,
        string text,
        string? speakerEmbeddingPath,
        string? instruct,
        string outputAudioPath,
        double speed,
        double pitch,
        int numSteps,
        double guidanceScale,
        bool denoise,
        double duration,
        bool preprocessPrompt,
        bool postprocessOutput,
        CancellationToken ct = default);

    Task CloneVoiceAsync(
        string engineId,
        string referenceAudioPath,
        string outputEmbeddingPath,
        string? referenceText,
        CancellationToken ct = default);

    Task UnloadVramAsync(CancellationToken ct = default);
}
