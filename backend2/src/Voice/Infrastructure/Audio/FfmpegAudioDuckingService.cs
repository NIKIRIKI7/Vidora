using System.Globalization;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Microsoft.Extensions.Logging;
using Voice.Domain.Exceptions;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Audio;

public sealed class FfmpegAudioDuckingService : IAudioDuckingService
{
    private readonly IProcessSupervisor _processSupervisor;
    private readonly IPathResolver _pathResolver;
    private readonly ILogger<FfmpegAudioDuckingService> _logger;

    public FfmpegAudioDuckingService(
        IProcessSupervisor processSupervisor,
        IPathResolver pathResolver,
        ILogger<FfmpegAudioDuckingService> logger)
    {
        _processSupervisor = processSupervisor;
        _pathResolver = pathResolver;
        _logger = logger;
    }

    public async Task<string> PostProcessVoiceAsync(string inputPath, string outputPath, AudioFilterSpec filterSpec, CancellationToken ct = default)
    {
        var safeInput = _pathResolver.ResolveSafePath(inputPath);
        var safeOutput = _pathResolver.ResolveSafePath(outputPath);
        var outDir = Path.GetDirectoryName(safeOutput);
        if (!string.IsNullOrEmpty(outDir)) Directory.CreateDirectory(outDir);

        var lufs = filterSpec.TargetLufs.ToString("F1", CultureInfo.InvariantCulture);
        var filterChain = $"highpass=f={filterSpec.HighpassHz},loudnorm=I={lufs}:TP=-1.0:LRA=11";
        if (filterSpec.RemoveSilence)
        {
            var stopThresh = filterSpec.SilenceThresholdDb.ToString("F1", CultureInfo.InvariantCulture);
            filterChain += $",silenceremove=stop_periods=-1:stop_duration=0.35:stop_threshold={stopThresh}dB";
        }

        var args = $"-y -i \"{safeInput}\" -af \"{filterChain}\" -ar 48000 -c:a pcm_s16le \"{safeOutput}\"";
        _logger.LogInformation("[AudioDSP] Запуск пост-обработки: LUFS {Lufs}, Highpass {Hp}Hz", lufs, filterSpec.HighpassHz);

        var result = await _processSupervisor.RunAsync("ffmpeg", args, outDir, cancellationToken: ct);
        if (result.ExitCode != 0 || !File.Exists(safeOutput))
        {
            _logger.LogError("[AudioDSP] Сбой обработки фильтра (ExitCode: {Code}): {Error}", result.ExitCode, result.StandardError);
            throw new AudioProcessingException(result.StandardError, safeInput);
        }

        return safeOutput;
    }

    public async Task<string> ApplySidechainDuckingAsync(string voiceAudioPath, string bgmAudioPath, string outputPath, DuckingSpec duckingSpec, CancellationToken ct = default)
    {
        var safeVoice = _pathResolver.ResolveSafePath(voiceAudioPath);
        var safeBgm = _pathResolver.ResolveSafePath(bgmAudioPath);
        var safeOutput = _pathResolver.ResolveSafePath(outputPath);
        var outDir = Path.GetDirectoryName(safeOutput);
        if (!string.IsNullOrEmpty(outDir)) Directory.CreateDirectory(outDir);

        var attack = duckingSpec.AttackMs.ToString(CultureInfo.InvariantCulture);
        var release = duckingSpec.ReleaseMs.ToString(CultureInfo.InvariantCulture);
        var filter = $"[0:a][1:a]sidechaincompress=threshold={duckingSpec.ThresholdInvariantText}:ratio={duckingSpec.CompressionRatioInvariantText}:attack={attack}:release={release}[ducked];[ducked][1:a]amix=inputs=2:duration=first:dropout_transition=2[out]";
        var args = $"-y -i \"{safeBgm}\" -i \"{safeVoice}\" -filter_complex \"{filter}\" -map \"[out]\" -ar 48000 -c:a aac -b:a 192k \"{safeOutput}\"";

        _logger.LogInformation("[AudioDSP] Применение Sidechain Ducking BGM под голос");
        var result = await _processSupervisor.RunAsync("ffmpeg", args, outDir, cancellationToken: ct);
        if (result.ExitCode != 0 || !File.Exists(safeOutput))
        {
            _logger.LogError("[AudioDSP] Ошибка сведения (ExitCode: {Code}): {Error}", result.ExitCode, result.StandardError);
            throw new AudioProcessingException(result.StandardError, safeOutput);
        }

        return safeOutput;
    }
}
