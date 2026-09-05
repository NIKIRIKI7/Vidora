using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Microsoft.Extensions.Logging;
using ProductionContext.Domain.Ports;

namespace ProductionContext.Infrastructure.Export;

public sealed class FfmpegVideoStitcher : IVideoStitcher
{
    private readonly IProcessSupervisor _processSupervisor;
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<FfmpegVideoStitcher> _logger;

    public FfmpegVideoStitcher(
        IProcessSupervisor processSupervisor,
        IPathResolver pathResolver,
        ILogger<FfmpegVideoStitcher> logger)
    {
        _processSupervisor = processSupervisor;
        _pathResolver = pathResolver;
        _logger = logger;
    }

    public async Task<string> ConcatenateScenesAsync(
        IReadOnlyList<StitchVideoItem> sceneVideos,
        string outputMp4Path,
        CancellationToken ct = default)
    {
        if (sceneVideos.Count == 0)
        {
            throw new ValidationException("sceneVideos", "Список видеофрагментов для склейки пуст.");
        }

        var safeOutput = _pathResolver.ResolveSafePath(outputMp4Path);
        var workDir = Path.GetDirectoryName(safeOutput) ?? Directory.GetCurrentDirectory();
        var concatListPath = Path.Combine(workDir, $"concat_{Guid.NewGuid():N}.txt");

        var lines = sceneVideos.Select(v => $"file '{_pathResolver.ResolveSafePath(v.VideoFilePath).Replace('\\', '/')}'");
        await File.WriteAllLinesAsync(concatListPath, lines, ct);

        var args = $"-y -f concat -safe 0 -i \"{concatListPath}\" -c copy \"{safeOutput}\"";
        _logger.LogInformation("[VideoStitcher] Склейка {Count} сцен через concat demuxer -> {Output}", sceneVideos.Count, safeOutput);

        try
        {
            var result = await _processSupervisor.RunAsync("ffmpeg", args, workDir, cancellationToken: ct);
            if (result.ExitCode != 0 || !File.Exists(safeOutput))
            {
                _logger.LogError("[VideoStitcher] Ошибка склейки FFmpeg: {Error}", result.StandardError);
                throw new ProcessExecutionException("ffmpeg", result.ExitCode, result.StandardError, concatListPath);
            }
        }
        finally
        {
            if (File.Exists(concatListPath)) File.Delete(concatListPath);
        }

        return safeOutput;
    }

    public async Task<string> MuxMasterAudioAsync(
        string inputVideoPath,
        string inputAudioPath,
        string outputFinalVideoPath,
        CancellationToken ct = default)
    {
        var safeVideo = _pathResolver.ResolveSafePath(inputVideoPath);
        var safeAudio = _pathResolver.ResolveSafePath(inputAudioPath);
        var safeOutput = _pathResolver.ResolveSafePath(outputFinalVideoPath);
        var workDir = Path.GetDirectoryName(safeOutput) ?? Directory.GetCurrentDirectory();

        var args = $"-y -i \"{safeVideo}\" -i \"{safeAudio}\" -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest \"{safeOutput}\"";
        _logger.LogInformation("[VideoStitcher] Сведение видео {Video} и аудио {Audio} -> {Output}",
            Path.GetFileName(safeVideo), Path.GetFileName(safeAudio), safeOutput);

        var result = await _processSupervisor.RunAsync("ffmpeg", args, workDir, cancellationToken: ct);
        if (result.ExitCode != 0 || !File.Exists(safeOutput))
        {
            _logger.LogError("[VideoStitcher] Ошибка сведения аудио FFmpeg: {Error}", result.StandardError);
            throw new ProcessExecutionException("ffmpeg", result.ExitCode, result.StandardError, safeOutput);
        }

        return safeOutput;
    }
}
