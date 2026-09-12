using System.Text.Json.Serialization;

namespace Voice.Domain.Ports;

public sealed record LocalTtsEngineDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("capabilities")] IReadOnlyList<string> Capabilities);

/// <summary>
/// HTTP-клиент к локальному ML-воркеру (python_services/tts_engine).
/// Выполняется через общий GPU-лок и не хранит состояние между запросами (stateless-сервис).
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
        string? referenceAudioPath = null,
        string? referenceText = null,
        CancellationToken ct = default);

    Task CloneVoiceAsync(
        string engineId,
        string referenceAudioPath,
        string outputEmbeddingPath,
        string? referenceText,
        CancellationToken ct = default);

    Task UnloadVramAsync(CancellationToken ct = default);
}
