using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Microsoft.Extensions.Logging;
using SystemContext.Domain.Ports;
using Voice.Domain;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Cloud;

public sealed class OpenAiSpeechProvider : ITtsEngineProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.CloudOpenAi;

    private readonly HttpClient _httpClient;
    private readonly ISystemSettingRepository _settingRepo;
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<OpenAiSpeechProvider> _logger;

    public OpenAiSpeechProvider(
        HttpClient httpClient,
        ISystemSettingRepository settingRepo,
        IPathResolver pathResolver,
        ILogger<OpenAiSpeechProvider> logger)
    {
        _httpClient = httpClient;
        _settingRepo = settingRepo;
        _pathResolver = pathResolver;
        _logger = logger;
    }

    public async Task<RawSynthesisResult> SynthesizeAsync(string text, VoiceSpec spec, string destinationPath, CancellationToken ct)
    {
        var apiKeySetting = await _settingRepo.GetByKeyAsync("integrations.openai.api_key", ct);
        var apiKey = apiKeySetting?.Value;

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            _logger.LogError("[OpenAiSpeechProvider] Отсутствует ключ integrations.openai.api_key в настройках.");
            throw new ValidationException("openai_key", "API-ключ OpenAI не задан в system_settings.");
        }

        var safeDest = _pathResolver.ResolveSafePath(destinationPath);
        var dir = Path.GetDirectoryName(safeDest);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        var requestBody = new
        {
            model = "tts-1-hd",
            input = text,
            voice = spec.SpeakerId.ToLowerInvariant(),
            speed = spec.Speed,
            response_format = "mp3"
        };

        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/audio/speech");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        request.Content = new StringContent(JsonSerializer.Serialize(requestBody), Encoding.UTF8, "application/json");

        _logger.LogInformation("[OpenAiSpeechProvider] Отправка HTTP запроса в OpenAI API (Voice: {Voice}, Speed: {Speed})...", spec.SpeakerId, spec.Speed);
        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);

        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(ct);
            _logger.LogError("[OpenAiSpeechProvider] Ошибка API ({Status}): {Error}", response.StatusCode, err);
            throw new ValidationException("openai", $"Ошибка OpenAI Speech API: {err}");
        }

        await using (var contentStream = await response.Content.ReadAsStreamAsync(ct))
        await using (var fileStream = new FileStream(safeDest, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true))
        {
            await contentStream.CopyToAsync(fileStream, ct);
        }

        var fileInfo = new FileInfo(safeDest);
        _logger.LogInformation("[OpenAiSpeechProvider] Аудиофайл успешно сохранен: {Path} ({Bytes} байт)", safeDest, fileInfo.Length);
        return new RawSynthesisResult(safeDest, 0.0, fileInfo.Length);
    }
}
