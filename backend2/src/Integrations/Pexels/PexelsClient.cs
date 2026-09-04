using System.Text.Json;
using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Kernel.Ports;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace Integrations.Pexels;

public sealed class PexelsClient : IPexelsClient
{
    private const string BaseApiUrl = "https://api.pexels.com/videos/search";
    private readonly HttpClient _httpClient;
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<PexelsClient> _logger;
    private readonly string _apiKey;

    public PexelsClient(
        HttpClient httpClient,
        IPathResolver pathResolver,
        IConfiguration configuration,
        ILogger<PexelsClient> logger)
    {
        _httpClient = httpClient;
        _pathResolver = pathResolver;
        _logger = logger;
        _apiKey = configuration["Integrations:Pexels:ApiKey"] ?? string.Empty;
    }

    public async Task<IReadOnlyList<PexelsVideo>> SearchVideosAsync(
        PexelsSearchFilter filter,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            _logger.LogWarning("[Pexels] API-ключ не сконфигурирован ('Integrations:Pexels:ApiKey'). Запрос пропущен.");
            return [];
        }

        var url = $"{BaseApiUrl}?query={Uri.EscapeDataString(filter.Query)}&per_page={filter.PerPage}&page={filter.Page}";
        if (!string.IsNullOrWhiteSpace(filter.Orientation))
        {
            url += $"&orientation={filter.Orientation}";
        }
        if (!string.IsNullOrWhiteSpace(filter.Size))
        {
            url += $"&size={filter.Size}";
        }

        using var request = new HttpRequestMessage(HttpMethod.Get, url);
        request.Headers.Add("Authorization", _apiKey);

        var response = await _httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(cancellationToken);
            var statusCodeNumber = (int)response.StatusCode;
            _logger.LogError("[Pexels] Ошибка Pexels API ({Code}): {Error}", statusCodeNumber, err);
            throw new ValidationException("pexels", $"Ошибка Pexels API ({statusCodeNumber}): {err}");
        }

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
        using var doc = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);

        var result = new List<PexelsVideo>();
        if (doc.RootElement.TryGetProperty("videos", out var videosArray) && videosArray.ValueKind == JsonValueKind.Array)
        {
            foreach (var v in videosArray.EnumerateArray())
            {
                var id = v.GetProperty("id").GetInt32();
                var width = v.GetProperty("width").GetInt32();
                var height = v.GetProperty("height").GetInt32();
                var duration = v.GetProperty("duration").GetInt32();
                var pageUrl = v.GetProperty("url").GetString() ?? string.Empty;
                var image = v.GetProperty("image").GetString() ?? string.Empty;
                var user = v.GetProperty("user").GetProperty("name").GetString() ?? string.Empty;

                var files = new List<PexelsVideoFile>();
                if (v.TryGetProperty("video_files", out var filesArray))
                {
                    foreach (var f in filesArray.EnumerateArray())
                    {
                        files.Add(new PexelsVideoFile(
                            Id: f.GetProperty("id").GetInt32(),
                            Quality: f.GetProperty("quality").GetString() ?? "sd",
                            FileType: f.GetProperty("file_type").GetString() ?? "video/mp4",
                            Width: f.TryGetProperty("width", out var wp) && wp.ValueKind == JsonValueKind.Number ? wp.GetInt32() : 0,
                            Height: f.TryGetProperty("height", out var hp) && hp.ValueKind == JsonValueKind.Number ? hp.GetInt32() : 0,
                            Fps: f.TryGetProperty("fps", out var fp) && fp.ValueKind == JsonValueKind.Number ? fp.GetDouble() : 30.0,
                            Link: f.GetProperty("link").GetString() ?? string.Empty));
                    }
                }

                result.Add(new PexelsVideo(id, width, height, duration, pageUrl, image, user, files));
            }
        }

        return result;
    }

    public async Task<string> DownloadVideoAsync(
        string downloadUrl,
        string destinationFilePath,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default)
    {
        var safeDestination = _pathResolver.ResolveSafePath(destinationFilePath);
        var dir = Path.GetDirectoryName(safeDestination);
        if (!string.IsNullOrEmpty(dir))
        {
            Directory.CreateDirectory(dir);
        }

        _logger.LogInformation("[Pexels:Download] Загрузка стока в {Path}", safeDestination);

        using var response = await _httpClient.GetAsync(downloadUrl, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var err = await response.Content.ReadAsStringAsync(cancellationToken);
            var statusCodeNumber = (int)response.StatusCode;
            throw new ValidationException("pexels", $"Сбой загрузки видеофайла ({statusCodeNumber}): {err}");
        }

        var totalBytes = response.Content.Headers.ContentLength ?? -1L;
        await using var contentStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        await using var fileStream = new FileStream(safeDestination, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true);

        var buffer = new byte[81920];
        long totalRead = 0;
        int bytesRead;

        while ((bytesRead = await contentStream.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken)) > 0)
        {
            await fileStream.WriteAsync(buffer.AsMemory(0, bytesRead), cancellationToken);
            totalRead += bytesRead;
            if (totalBytes > 0)
            {
                progress?.Report(Math.Round((double)totalRead / totalBytes * 100.0, 2));
            }
        }

        _logger.LogInformation("[Pexels:Download] Успешно сохранено ({Bytes} байт): {Path}", totalRead, safeDestination);
        return safeDestination;
    }
}
