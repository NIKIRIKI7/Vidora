using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Voice.Domain;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Local;

public sealed class LocalTtsCloneProvider : IVoiceCloneProvider
{
    private readonly ILocalTtsClient _client;
    private readonly IGpuManager _gpuManager;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<LocalTtsCloneProvider> _logger;

    public LocalTtsCloneProvider(
        ILocalTtsClient client,
        IGpuManager gpuManager,
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<LocalTtsCloneProvider> logger)
    {
        _client = client;
        _gpuManager = gpuManager;
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public bool SupportsEngine(VoiceEngineType engine) => engine == VoiceEngineType.LocalTts;

    public async Task<CloneVoiceResult> CloneVoiceAsync(ClonedVoiceSpec spec, CancellationToken ct = default)
    {
        var safeRefAudio = _pathResolver.ResolveSafePath(spec.ReferenceAudioPath);
        if (!File.Exists(safeRefAudio))
        {
            throw new ResourceNotFoundException("ReferenceAudio", safeRefAudio);
        }

        var engineId = spec.LocalEngineId;
        if (string.IsNullOrWhiteSpace(engineId) || engineId == "default")
        {
            var models = await _client.GetAvailableModelsAsync(ct);
            engineId = models.FirstOrDefault(m => m.Capabilities.Contains("clone", StringComparer.OrdinalIgnoreCase))?.Id ?? "omni_voice_v1";
        }

        var speakerId = $"clone_local_{Guid.NewGuid():N}"[..16];

        // Папка для векторов диктора локального воркера (.pt voice clone prompts)
        var embeddingsDir = _pathResolver.ResolveSafePath(Path.Combine(_storageConfig.DataStorageDir, "ai-models", "voice_embeddings"));
        Directory.CreateDirectory(embeddingsDir);
        var embeddingPath = Path.Combine(embeddingsDir, $"{speakerId}.pt");

        _logger.LogInformation("[LocalTts] Ожидание блокировки VRAM для извлечения эмбеддинга: {EngineId}", engineId);

        await using var gpuLock = await _gpuManager.AcquireGpuLockAsync($"LocalClone_{engineId}", ct);

        _logger.LogInformation("[LocalTts] VRAM заблокирован. Запуск клонирования в ML-сервисе...");

        await _client.CloneVoiceAsync(
            engineId: engineId,
            referenceAudioPath: safeRefAudio,
            outputEmbeddingPath: embeddingPath,
            referenceText: spec.ReferenceText,
            ct: ct);

        // Превью формируется из эталона, т.к. вектор диктора (.pt) не воспроизводится напрямую.
        return new CloneVoiceResult(speakerId, safeRefAudio, embeddingPath);
    }
}
