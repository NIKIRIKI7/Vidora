using System.Globalization;
using System.Text.RegularExpressions;
using Integrations.YouTube.Config;
using Integrations.YouTube.Contracts;
using Integrations.YouTube.Exceptions;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Integrations.YouTube.Downloader;

public sealed partial class YtDlpDownloader : IYouTubeDownloader
{
    private readonly IProcessSupervisor _processSupervisor;
    private readonly IPathResolver _pathResolver;
    private readonly YouTubeOptions _options;
    private readonly ILogger<YtDlpDownloader> _logger;

    public YtDlpDownloader(
        IProcessSupervisor processSupervisor,
        IPathResolver pathResolver,
        IOptions<YouTubeOptions> options,
        ILogger<YtDlpDownloader> logger)
    {
        _processSupervisor = processSupervisor;
        _pathResolver = pathResolver;
        _options = options.Value;
        _logger = logger;
    }

    public Task<YouTubeDownloadResult> DownloadVideoAsync(
        string videoUrlOrId,
        YouTubeDownloadOptions? options = null,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default)
    {
        var downloadOpts = (options ?? new YouTubeDownloadOptions()) with { AudioOnly = false };
        return ExecuteDownloadAsync(videoUrlOrId, downloadOpts, progress, cancellationToken);
    }

    public Task<YouTubeDownloadResult> DownloadAudioAsync(
        string videoUrlOrId,
        YouTubeDownloadOptions? options = null,
        IProgress<double>? progress = null,
        CancellationToken cancellationToken = default)
    {
        var downloadOpts = (options ?? new YouTubeDownloadOptions()) with { AudioOnly = true };
        return ExecuteDownloadAsync(videoUrlOrId, downloadOpts, progress, cancellationToken);
    }

    private async Task<YouTubeDownloadResult> ExecuteDownloadAsync(
        string videoUrlOrId,
        YouTubeDownloadOptions options,
        IProgress<double>? progress,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(videoUrlOrId);

        var ytDlpExe = _options.ResolveYtDlpExecutable();
        var rawTargetDir = options.OutputDirectory ?? _options.DownloadDirectory;
        var targetDir = _pathResolver.ResolveSafePath(rawTargetDir);

        if (!Directory.Exists(targetDir))
        {
            Directory.CreateDirectory(targetDir);
        }

        // Шаблон имени файла: %(id)s.%(ext)s или пользовательский префикс
        string outputPattern = string.IsNullOrWhiteSpace(options.CustomFileName)
            ? "%(id)s.%(ext)s"
            : $"{_pathResolver.SanitizeFileName(options.CustomFileName)}.%(ext)s";

        var fullOutputPathTemplate = Path.Combine(targetDir, outputPattern);

        // Сборка аргументов yt-dlp
        var args = BuildYtDlpArguments(videoUrlOrId, fullOutputPathTemplate, options);

        using var timeoutCts = new CancellationTokenSource(TimeSpan.FromSeconds(_options.DownloadTimeoutSeconds));
        using var linkedCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, timeoutCts.Token);

        _logger.LogInformation("[yt-dlp] Старт загрузки: {Exe} URL: {Target}, Режим: {Mode}",
            ytDlpExe, videoUrlOrId, options.AudioOnly ? "Audio" : "Video");

        string? resolvedDestination = null;

        ProcessExecutionResult result;
        try
        {
            result = await _processSupervisor.RunAsync(
                ytDlpExe,
                args,
                workingDirectory: targetDir,
                onStdOut: line =>
                {
                    ParseDownloadProgress(line, progress);
                    var dest = TryExtractDestinationFile(line);
                    if (dest != null) resolvedDestination = dest;
                },
                cancellationToken: linkedCts.Token);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Отмена запроса вызывающим кодом — пробрасываем напрямую
            _logger.LogInformation("[yt-dlp] Загрузка отменена вызывающим кодом для: {Target}", videoUrlOrId);
            throw;
        }
        catch (OperationCanceledException) when (timeoutCts.IsCancellationRequested)
        {
            // Сработал внутренний таймаут загрузки
            _logger.LogWarning("[yt-dlp] Превышен таймаут загрузки ({Timeout} сек.) для: {Target}", _options.DownloadTimeoutSeconds, videoUrlOrId);
            throw new YouTubeDownloadException($"Превышен таймаут скачивания ({_options.DownloadTimeoutSeconds} сек.)", videoUrlOrId);
        }
        catch (Exception ex) when (ex is not YouTubeDownloadException)
        {
            throw new YouTubeDownloadException($"Сбой выполнения процесса yt-dlp: {ex.Message}", videoUrlOrId, ex);
        }

        if (result.ExitCode != 0)
        {
            _logger.LogError("[yt-dlp] Ошибка скачивания (ExitCode={Code}): {Err}", result.ExitCode, result.StandardError);
            throw new YouTubeDownloadException(result.StandardError, videoUrlOrId);
        }

        // Поиск скачанного файла на диске
        var finalFilePath = FindDownloadedFile(targetDir, resolvedDestination, options.CustomFileName, videoUrlOrId);

        var fileInfo = new FileInfo(finalFilePath);
        _logger.LogInformation("[yt-dlp] Успешно скачано: {Path} ({SizeMb} MB)",
            finalFilePath, Math.Round((double)fileInfo.Length / (1024 * 1024), 2));

        return new YouTubeDownloadResult
        {
            VideoId = videoUrlOrId,
            FilePath = finalFilePath,
            FileSizeBytes = fileInfo.Length,
            Format = fileInfo.Extension.TrimStart('.').ToLowerInvariant(),
            IsAudioOnly = options.AudioOnly
        };
    }

    private static string BuildYtDlpArguments(string videoUrlOrId, string outputTemplate, YouTubeDownloadOptions options)
    {
        var args = new List<string>
        {
            "--no-playlist",
            "--no-warnings",
            "--newline",
            "-o", $"\"{outputTemplate}\""
        };

        if (options.AudioOnly)
        {
            args.Add("-x");
            args.Add("--audio-format");
            args.Add(options.AudioFormat);
            args.Add("--audio-quality");
            args.Add("0"); // Лучшее качество аудио
        }
        else
        {
            // Скачиваем видео до заданного MaxHeight со сведением в mp4
            args.Add("-f");
            args.Add($"\"bestvideo[height<={options.MaxHeight}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={options.MaxHeight}]+bestaudio/best[height<={options.MaxHeight}]/best\"");
            args.Add("--merge-output-format");
            args.Add("mp4");
        }

        if (options.IncludeSubtitles)
        {
            args.Add("--write-subs");
            args.Add("--sub-langs");
            args.Add("ru,en");
        }

        args.Add($"\"{videoUrlOrId.Trim()}\"");
        return string.Join(" ", args);
    }

    private static void ParseDownloadProgress(string line, IProgress<double>? progress)
    {
        if (progress == null || string.IsNullOrWhiteSpace(line)) return;

        var match = DownloadProgressRegex().Match(line);
        if (match.Success && double.TryParse(match.Groups[1].Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var percent))
        {
            progress.Report(percent);
        }
    }

    private static string? TryExtractDestinationFile(string line)
    {
        var match = DestinationFileRegex().Match(line);
        return match.Success ? match.Groups[1].Value.Trim() : null;
    }

    private static string FindDownloadedFile(string targetDir, string? destinationPath, string? customName, string target)
    {
        if (!string.IsNullOrWhiteSpace(destinationPath) && File.Exists(destinationPath))
        {
            return Path.GetFullPath(destinationPath);
        }

        // Поиск по маске имени
        var searchPattern = !string.IsNullOrWhiteSpace(customName) ? $"{customName}.*" : "*.*";
        var files = Directory.GetFiles(targetDir, searchPattern)
            .Select(f => new FileInfo(f))
            .OrderByDescending(f => f.LastWriteTimeUtc)
            .ToList();

        if (files.Count > 0)
        {
            return files[0].FullName;
        }

        throw new YouTubeDownloadException($"Файл загрузки не найден в целевой директории: {targetDir}", target);
    }

    [GeneratedRegex(@"\[download\]\s+(\d+(?:\.\d+)?)%")]
    private static partial Regex DownloadProgressRegex();

    [GeneratedRegex(@"(?:\[download\] Destination: |\[Merger\] Merging formats into "")([^""]+)")]
    private static partial Regex DestinationFileRegex();
}
