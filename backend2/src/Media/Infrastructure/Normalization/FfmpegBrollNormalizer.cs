using System.Globalization;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using MediaContext.Domain.Exceptions;
using MediaContext.Domain.ValueObjects;
using Microsoft.Extensions.Logging;

namespace MediaContext.Infrastructure.Normalization;

/// <summary>
/// Адаптер видеонормализации: приводит произвольное видео к единому разрешению, FPS и соотношению сторон.
/// При несоответствии пропорций генерирует эффект размытого фона (blur-pad) без черных полос.
/// </summary>
public sealed class FfmpegBrollNormalizer : IBrollNormalizer
{
    private readonly IProcessSupervisor _processSupervisor;
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<FfmpegBrollNormalizer> _logger;

    public FfmpegBrollNormalizer(
        IProcessSupervisor processSupervisor,
        IPathResolver pathResolver,
        ILogger<FfmpegBrollNormalizer> logger)
    {
        _processSupervisor = processSupervisor;
        _pathResolver = pathResolver;
        _logger = logger;
    }

    public async Task<string> NormalizeVideoAsync(
        string sourceFilePath,
        string destinationFilePath,
        MediaDimensions targetDimensions,
        double targetFps = 30.0,
        CancellationToken ct = default)
    {
        var safeSource = _pathResolver.ResolveSafePath(sourceFilePath);
        var safeDest = _pathResolver.ResolveSafePath(destinationFilePath);

        var destDir = Path.GetDirectoryName(safeDest);
        if (!string.IsNullOrEmpty(destDir) && !Directory.Exists(destDir))
        {
            Directory.CreateDirectory(destDir);
        }

        int targetW = targetDimensions.Width;
        int targetH = targetDimensions.Height;
        string fpsStr = targetFps.ToString("F1", CultureInfo.InvariantCulture);

        // FFmpeg filter complex: blur-pad background + centered scaled foreground
        string filterComplex = $"\"[0:v]scale={targetW}:{targetH}:force_original_aspect_ratio=increase,boxblur=25:5,crop={targetW}:{targetH}[bg]; " +
                               $"[0:v]scale={targetW}:{targetH}:force_original_aspect_ratio=decrease[fg]; " +
                               $"[bg][fg]overlay=(W-w)/2:(H-h)/2,fps={fpsStr},format=yuv420p[outv]\"";

        string arguments = $"-y -i \"{safeSource}\" -filter_complex {filterComplex} -map \"[outv]\" -an -c:v libx264 -preset veryfast -crf 22 \"{safeDest}\"";

        _logger.LogInformation("[Normalizer] Запуск нормализации видео {Source} -> {Dest} ({Dimensions}, {Fps} fps)",
            Path.GetFileName(safeSource), Path.GetFileName(safeDest), targetDimensions, targetFps);

        var result = await _processSupervisor.RunAsync("ffmpeg", arguments, workingDirectory: destDir, cancellationToken: ct);

        if (result.ExitCode != 0)
        {
            _logger.LogError("[Normalizer] Сбой нормализации FFmpeg (ExitCode {Code}): {StdErr}", result.ExitCode, result.StandardError);
            throw new MediaProcessingException($"Сбой нормализации видео FFmpeg (ExitCode: {result.ExitCode})", safeSource);
        }

        if (!File.Exists(safeDest))
        {
            throw new MediaProcessingException("Итоговый нормализованный файл не обнаружен на диске после завершения FFmpeg.", safeDest);
        }

        return safeDest;
    }
}
