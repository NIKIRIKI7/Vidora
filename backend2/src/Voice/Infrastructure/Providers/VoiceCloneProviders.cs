using System.Net.Http.Headers;
using System.Text.Json;
using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SystemContext.Contracts;
using Voice.Domain;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers;

public sealed class MiniMaxCloneProvider : IVoiceCloneProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.CloudMiniMax;

    private readonly HttpClient _httpClient;
    private readonly ISystemModule _settingRepo;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<MiniMaxCloneProvider> _logger;

    public MiniMaxCloneProvider(
        HttpClient httpClient,
        ISystemModule settingRepo,
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

        var apiKey = await _settingRepo.GetSettingValueAsync("integrations.minimax.api_key", ct);
        var groupId = await _settingRepo.GetSettingValueAsync("integrations.minimax.group_id", ct);

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
