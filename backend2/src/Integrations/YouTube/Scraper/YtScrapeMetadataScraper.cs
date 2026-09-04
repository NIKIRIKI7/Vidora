using System.Text.Json;
using Integrations.YouTube.Config;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Exceptions;
using Kernel.Platform.Process;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Integrations.YouTube.Scraper;

public sealed class YtScrapeMetadataScraper : IYouTubeMetadataScraper
{
    private readonly IProcessSupervisor _processSupervisor;
    private readonly YouTubeOptions _options;
    private readonly ILogger<YtScrapeMetadataScraper> _logger;

    public YtScrapeMetadataScraper(
        IProcessSupervisor processSupervisor,
        IOptions<YouTubeOptions> options,
        ILogger<YtScrapeMetadataScraper> logger)
    {
        _processSupervisor = processSupervisor;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<YouTubeVideoMetadata> ScrapeVideoMetadataAsync(
        string videoUrlOrId,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);

        var pythonExe = _options.ResolvePythonExecutable();
        var scriptPath = _options.ResolveMetadataScript();

        if (!File.Exists(scriptPath))
        {
            throw new YouTubeScrapeException($"Файл Python-враппера не найден: {scriptPath}", videoUrlOrId);
        }

        var arguments = $"\"{scriptPath}\" \"{videoUrlOrId.Trim()}\"";

        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(_options.ScrapeTimeoutSeconds));
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        _logger.LogDebug("[ytscrape] Запуск скрапинга: {Python} {Args}", pythonExe, arguments);

        ProcessExecutionResult result;
        try
        {
            result = await _processSupervisor.RunAsync(
                pythonExe,
                arguments,
                workingDirectory: Path.GetDirectoryName(scriptPath),
                cancellationToken: linkedCts.Token);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Отмена запроса извне: пробрасываем без маскировки в 502 ошибку
            _logger.LogInformation("[ytscrape] Скрапинг метаданных отменен вызывающим кодом для: {Target}", videoUrlOrId);
            throw;
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            // Сработал локальный таймаут операции
            _logger.LogWarning("[ytscrape] Превышен таймаут скрапинга ({Timeout} сек.) для: {Target}", _options.ScrapeTimeoutSeconds, videoUrlOrId);
            throw new YouTubeScrapeException($"Превышен таймаут скрапинга метаданных ({_options.ScrapeTimeoutSeconds} сек.)", videoUrlOrId);
        }
        catch (Exception ex) when (ex is not YouTubeScrapeException)
        {
            throw new YouTubeScrapeException($"Сбой вызова подпроцесса python: {ex.Message}", videoUrlOrId, ex);
        }

        if (result.ExitCode != 0)
        {
            var errMessage = ExtractErrorMessage(result.StandardError, result.StandardOutput);
            _logger.LogError("[ytscrape] Завершился с кодом {ExitCode}: {Error}", result.ExitCode, errMessage);
            throw new YouTubeScrapeException(errMessage, videoUrlOrId);
        }

        return ParseJsonOutput(result.StandardOutput, videoUrlOrId);
    }

    private static YouTubeVideoMetadata ParseJsonOutput(string jsonOutput, string target)
    {
        if (string.IsNullOrWhiteSpace(jsonOutput))
        {
            throw new YouTubeScrapeException("Скрипт скрапера вернул пустой вывод.", target);
        }

        try
        {
            using var doc = JsonDocument.Parse(jsonOutput);
            var root = doc.RootElement;

            if (root.TryGetProperty("status", out var status) && status.GetString() == "error")
            {
                var msg = root.TryGetProperty("message", out var m) ? m.GetString() : "Неизвестная ошибка скрапера.";
                throw new YouTubeScrapeException(msg ?? "Ошибка скрапера.", target);
            }

            var videoId = root.GetProperty("video_id").GetString() ?? target;
            var title = root.TryGetProperty("title", out var t) ? t.GetString() ?? string.Empty : string.Empty;
            var desc = root.TryGetProperty("description", out var d) ? d.GetString() ?? string.Empty : string.Empty;
            var channel = root.TryGetProperty("channel_title", out var c) ? c.GetString() ?? string.Empty : string.Empty;
            var channelId = root.TryGetProperty("channel_id", out var ci) ? ci.GetString() ?? string.Empty : string.Empty;
            var views = root.TryGetProperty("view_count", out var v) && v.TryGetInt64(out var vi) ? vi : 0L;
            var seconds = root.TryGetProperty("length_seconds", out var sec) && sec.TryGetInt32(out var si) ? si : 0;
            var uploadDate = root.TryGetProperty("upload_date", out var ud) ? ud.GetString() : null;
            var thumb = root.TryGetProperty("thumbnail_url", out var th) ? th.GetString() : null;

            var keywords = new List<string>();
            if (root.TryGetProperty("keywords", out var kwElement) && kwElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in kwElement.EnumerateArray())
                {
                    var val = item.GetString();
                    if (!string.IsNullOrWhiteSpace(val)) keywords.Add(val);
                }
            }

            return new YouTubeVideoMetadata
            {
                VideoId = videoId,
                Title = title,
                Description = desc,
                ChannelTitle = channel,
                ChannelId = channelId,
                ViewCount = views,
                Duration = TimeSpan.FromSeconds(seconds),
                UploadDate = uploadDate,
                Keywords = keywords,
                ThumbnailUrl = thumb
            };
        }
        catch (JsonException ex)
        {
            throw new YouTubeScrapeException($"Ошибка десериализации JSON метаданных: {ex.Message}. Исходный вывод: {jsonOutput}", target, ex);
        }
    }

    private static string ExtractErrorMessage(string stdErr, string stdOut)
    {
        if (!string.IsNullOrWhiteSpace(stdErr))
        {
            try
            {
                using var doc = JsonDocument.Parse(stdErr);
                if (doc.RootElement.TryGetProperty("message", out var msg))
                {
                    return msg.GetString() ?? stdErr.Trim();
                }
            }
            catch { }
            return stdErr.Trim();
        }

        return !string.IsNullOrWhiteSpace(stdOut) ? stdOut.Trim() : "Процесс скрапинга завершился с ошибкой.";
    }
}
