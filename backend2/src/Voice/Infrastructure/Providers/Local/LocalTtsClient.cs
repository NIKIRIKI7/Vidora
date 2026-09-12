using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Voice.Domain.Exceptions;
using Voice.Domain.Ports;

namespace Voice.Infrastructure.Providers.Local;

public sealed class LocalTtsClient : ILocalTtsClient
{
    private readonly HttpClient _http;
    private readonly ILogger<LocalTtsClient> _logger;

    public LocalTtsClient(HttpClient http, ILogger<LocalTtsClient> logger)
    {
        _http = http;
        _logger = logger;
    }

    public async Task<IReadOnlyList<LocalTtsEngineDto>> GetAvailableModelsAsync(CancellationToken ct = default)
    {
        try
        {
            var response = await _http.GetFromJsonAsync<JsonElement>("/api/v1/models", ct);
            if (response.TryGetProperty("engines", out var engines) && engines.ValueKind == JsonValueKind.Array)
            {
                return engines.Deserialize<IReadOnlyList<LocalTtsEngineDto>>() ?? [];
            }
            return [];
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Graceful degradation: если воркер выключен, локальных моделей просто нет.
            _logger.LogDebug(ex, "[LocalTts] ML-воркер недоступен при дискавери моделей.");
            return [];
        }
    }

    public async Task SynthesizeAsync(
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
        CancellationToken ct = default)
    {
        var payload = new
        {
            engine_id = engineId,
            text = text,
            speaker_embedding_path = speakerEmbeddingPath,
            instruct = instruct,
            output_audio_path = outputAudioPath,
            speed = speed,
            pitch = pitch,
            reference_audio_path = referenceAudioPath,
            reference_text = referenceText,
            generation_config = new
            {
                num_steps = numSteps,
                guidance_scale = guidanceScale,
                denoise = denoise,
                duration = duration,
                preprocess_prompt = preprocessPrompt,
                postprocess_output = postprocessOutput
            }
        };

        var response = await _http.PostAsJsonAsync("/api/v1/synthesize", payload, ct);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("[LocalTts] Синтез завершился ошибкой ({Status}): {Error}", response.StatusCode, err);
            throw new VoiceSynthesisException($"Local TTS Error: {err}");
        }
    }

    public async Task CloneVoiceAsync(
        string engineId,
        string referenceAudioPath,
        string outputEmbeddingPath,
        string? referenceText,
        CancellationToken ct = default)
    {
        var payload = new
        {
            engine_id = engineId,
            reference_audio_path = referenceAudioPath,
            output_embedding_path = outputEmbeddingPath,
            reference_text = referenceText
        };

        var response = await _http.PostAsJsonAsync("/api/v1/clone", payload, ct);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("[LocalTts] Клонирование завершилось ошибкой ({Status}): {Error}", response.StatusCode, err);
            throw new VoiceSynthesisException($"Local Clone Error: {err}");
        }
    }

    public async Task UnloadVramAsync(CancellationToken ct = default)
    {
        try
        {
            await _http.PostAsync("/api/v1/vram/unload", null, ct);
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Игнорируем, если воркер недоступен — VRAM чистится только когда он жив.
            _logger.LogDebug(ex, "[LocalTts] Не удалось выгрузить VRAM ML-воркера.");
        }
    }
}
