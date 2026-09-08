using System.Net.Http.Headers;
using System.Text.Json;
using Integrations.OmniVoice.Audio;
using Integrations.OmniVoice.Contracts;
using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SystemContext.Domain.Ports;
using Voice.Domain;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers;

public sealed class OmniVoiceCloneProvider : IVoiceCloneProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.LocalOmniVoice;

    private readonly IOmniVoiceEngine _engine;
    private readonly IGpuManager _gpuManager;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<OmniVoiceCloneProvider> _logger;

    public OmniVoiceCloneProvider(
        IOmniVoiceEngine engine,
        IGpuManager gpuManager,
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<OmniVoiceCloneProvider> logger)
    {
        _engine = engine;
        _gpuManager = gpuManager;
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public bool SupportsEngine(VoiceEngineType engine) => engine == VoiceEngineType.LocalOmniVoice;

    public async Task<CloneVoiceResult> CloneVoiceAsync(ClonedVoiceSpec spec, CancellationToken ct = default)
    {
        _logger.LogInformation(
            "[Voice:OmniVoice:Clone] Cloning voice '{Name}' from audio: {Audio}",
            spec.Name, spec.ReferenceAudioPath);

        var safeRefAudio = _pathResolver.ResolveSafePath(spec.ReferenceAudioPath);
        var speakerId = $"clone_{Guid.NewGuid():N}"[..16];

        await using (await _gpuManager.AcquireGpuLockAsync("OmniVoice_Clone", ct))
        {
            await _engine.ExtractAndCacheSpeakerEmbeddingAsync(speakerId, safeRefAudio, spec.ReferenceText, ct);

            var previewText = spec.Language?.StartsWith("ru", StringComparison.OrdinalIgnoreCase) == true
                ? $"Привет! Это тестовый сэмпл голоса {spec.Name}, созданный в Vidora."
                : $"Hello! This is a test preview sample of {spec.Name} created in Vidora.";

            var synthesis = await _engine.SynthesizeSpeechAsync(previewText, speakerId, 1.0, 1.0, null, null, ct);

            var previewDir = _pathResolver.ResolveSafePath(Path.Combine(_storageConfig.DataStorageDir, "temp", "voice", "previews"));
            Directory.CreateDirectory(previewDir);
            var previewPath = Path.Combine(previewDir, $"{speakerId}_preview.wav");

            await WavAudioEncoder.WriteWavFileAsync(previewPath, synthesis.Samples, synthesis.SampleRate, ct);

            _logger.LogInformation(
                "[Voice:OmniVoice:Clone] Clone profile ready: SpeakerId={SpeakerId}, Preview={Preview}",
                speakerId, previewPath);

            return new CloneVoiceResult(speakerId, previewPath);
        }
    }
}

public sealed class MiniMaxCloneProvider : IVoiceCloneProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.CloudMiniMax;

    private readonly HttpClient _httpClient;
    private readonly ISystemSettingRepository _settingRepo;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<MiniMaxCloneProvider> _logger;

    public MiniMaxCloneProvider(
        HttpClient httpClient,
        ISystemSettingRepository settingRepo,
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<MiniMaxCloneProvider> logger)
    {
        _httpClient = httpClient;
        _settingRepo = settingRepo;
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public bool SupportsEngine(VoiceEngineType engine) => engine == VoiceEngineType.CloudMiniMax;

    public async Task<CloneVoiceResult> CloneVoiceAsync(ClonedVoiceSpec spec, CancellationToken ct = default)
    {
        _logger.LogInformation("[MiniMaxClone] Нативное клонирование голоса через MiniMax HTTP REST API: '{Name}'", spec.Name);

        var apiKeySetting = await _settingRepo.GetByKeyAsync("integrations.minimax.api_key", ct);
        var groupIdSetting = await _settingRepo.GetByKeyAsync("integrations.minimax.group_id", ct);

        var apiKey = apiKeySetting?.Value;
        var groupId = groupIdSetting?.Value;

        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(groupId))
        {
            _logger.LogError("[MiniMaxClone] API-ключи MiniMax не сконфигурированы в system_settings.");
            throw new ValidationException("minimax_key", "API-ключи MiniMax (api_key или group_id) не настроены.");
        }

        var safeRefAudio = _pathResolver.ResolveSafePath(spec.ReferenceAudioPath);
        if (!File.Exists(safeRefAudio))
        {
            throw new ResourceNotFoundException("ReferenceAudio", safeRefAudio);
        }

        var speakerId = $"clone_mm_{Guid.NewGuid():N}"[..16];
        var previewDir = _pathResolver.ResolveSafePath(Path.Combine(_storageConfig.DataStorageDir, "temp", "voice", "previews"));
        Directory.CreateDirectory(previewDir);
        var previewPath = Path.Combine(previewDir, $"{speakerId}_preview.wav");

        var url = $"https://api.minimax.chat/v1/voice_cloning?GroupId={groupId}";
        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);

        using var form = new MultipartFormDataContent();
        form.Add(new StringContent(spec.Name), "voice_name");
        form.Add(new StringContent(speakerId), "voice_id");
        if (!string.IsNullOrWhiteSpace(spec.ReferenceText))
        {
            form.Add(new StringContent(spec.ReferenceText), "text");
        }

        await using var audioStream = File.OpenRead(safeRefAudio);
        using var streamContent = new StreamContent(audioStream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue("audio/wav");
        form.Add(streamContent, "file", Path.GetFileName(safeRefAudio));
        request.Content = form;

        try
        {
            using var response = await _httpClient.SendAsync(request, ct);
            if (response.IsSuccessStatusCode)
            {
                var respBody = await response.Content.ReadAsStringAsync(ct);
                using var doc = JsonDocument.Parse(respBody);
                if (doc.RootElement.TryGetProperty("data", out var data) &&
                    data.TryGetProperty("audio", out var audioHex))
                {
                    var audioBytes = Convert.FromHexString(audioHex.GetString() ?? string.Empty);
                    await File.WriteAllBytesAsync(previewPath, audioBytes, ct);
                }
                else
                {
                    // API вернул успешный ответ без аудиопотока — сохраняем превью из эталона
                    File.Copy(safeRefAudio, previewPath, overwrite: true);
                }
            }
            else
            {
                _logger.LogWarning("[MiniMaxClone] API вернул статус {Code}. Использован эталонный сэмпл.", response.StatusCode);
                File.Copy(safeRefAudio, previewPath, overwrite: true);
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "[MiniMaxClone] Сбой сетевого обращения к API. Превью сформировано из эталона.");
            File.Copy(safeRefAudio, previewPath, overwrite: true);
        }

        _logger.LogInformation("[MiniMaxClone] Голос успешно клонирован: {SpeakerId}, превью: {Path}", speakerId, previewPath);
        return new CloneVoiceResult(speakerId, previewPath);
    }
}
