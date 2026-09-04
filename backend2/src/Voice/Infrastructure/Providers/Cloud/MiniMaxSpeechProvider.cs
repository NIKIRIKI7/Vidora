using System.Text;
using System.Text.Json;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Microsoft.Extensions.Logging;
using SystemContext.Domain.Ports;
using Voice.Domain;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Cloud;

public sealed class MiniMaxSpeechProvider : ITtsEngineProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.CloudMiniMax;

    private readonly HttpClient _httpClient;
    private readonly ISystemSettingRepository _settingRepo;
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<MiniMaxSpeechProvider> _logger;

    public MiniMaxSpeechProvider(
        HttpClient httpClient,
        ISystemSettingRepository settingRepo,
        IPathResolver pathResolver,
        ILogger<MiniMaxSpeechProvider> logger)
    {
        _httpClient = httpClient;
        _settingRepo = settingRepo;
        _pathResolver = pathResolver;
        _logger = logger;
    }

    public async Task<RawSynthesisResult> SynthesizeAsync(string text, VoiceSpec spec, string destinationPath, CancellationToken ct)
    {
        var apiKeySetting = await _settingRepo.GetByKeyAsync("integrations.minimax.api_key", ct);
        var groupIdSetting = await _settingRepo.GetByKeyAsync("integrations.minimax.group_id", ct);

        var apiKey = apiKeySetting?.Value;
        var groupId = groupIdSetting?.Value;

        if (string.IsNullOrWhiteSpace(apiKey) || string.IsNullOrWhiteSpace(groupId))
        {
            _logger.LogError("[MiniMaxProvider] Отсутствуют ключи MiniMax API в системных настройках.");
            throw new ValidationException("minimax_key", "API-ключи MiniMax не сконфигурированы.");
        }

        var safeDest = _pathResolver.ResolveSafePath(destinationPath);
        var dir = Path.GetDirectoryName(safeDest);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        var url = $"https://api.minimax.chat/v1/t2a_v2?GroupId={groupId}";
        var requestBody = new
        {
            model = "speech-01-turbo",
            text,
            stream = false,
            voice_setting = new
            {
                voice_id = spec.SpeakerId,
                speed = spec.Speed,
                pitch = spec.Pitch
            },
            audio_setting = new
            {
                sample_rate = 32000,
                bitrate = 128000,
                format = "mp3"
            }
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, url);
        request.Headers.Add("Authorization", $"Bearer {apiKey}");
        request.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        _logger.LogInformation("[MiniMaxProvider] Вызов MiniMax T2A API...");
        using var response = await _httpClient.SendAsync(request, ct);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("[MiniMaxProvider] Ошибка API MiniMax: {Error}", err);
            throw new ValidationException("minimax", $"Ошибка MiniMax API: {err}");
        }

        var responseJson = await response.Content.ReadAsStringAsync(ct);
        using var doc = JsonDocument.Parse(responseJson);
        var root = doc.RootElement;

        if (root.TryGetProperty("data", out var data) && data.TryGetProperty("audio", out var audioHex))
        {
            var hexString = audioHex.GetString() ?? string.Empty;
            var audioBytes = Convert.FromHexString(hexString);
            await File.WriteAllBytesAsync(safeDest, audioBytes, ct);
        }
        else
        {
            _logger.LogError("[MiniMaxProvider] Поле audio отсутствует в ответе MiniMax.");
            throw new ValidationException("minimax", "MiniMax не вернул аудиопоток.");
        }

        var fileInfo = new FileInfo(safeDest);
        _logger.LogInformation("[MiniMaxProvider] Файл сохранен: {Path} ({Bytes} байт)", safeDest, fileInfo.Length);
        return new RawSynthesisResult(safeDest, 0.0, fileInfo.Length);
    }
}
