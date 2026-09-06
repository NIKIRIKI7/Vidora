using System.Text.Json;
using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SystemContext.Domain;
using SystemContext.Domain.Ports;
using Voice.Domain;
using Voice.Domain.Exceptions;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Local;

public sealed class OmniVoiceTtsProvider : ITtsEngineProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.LocalOmniVoice;

    private readonly IMlProcessHost _mlHost;
    private readonly IPathResolver _pathResolver;
    private readonly IAiModelRepository _modelRepo;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<OmniVoiceTtsProvider> _logger;

    public OmniVoiceTtsProvider(
        IMlProcessHost mlHost,
        IPathResolver pathResolver,
        IAiModelRepository modelRepo,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<OmniVoiceTtsProvider> logger)
    {
        _mlHost = mlHost;
        _pathResolver = pathResolver;
        _modelRepo = modelRepo;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public async Task<RawSynthesisResult> SynthesizeAsync(string text, VoiceSpec spec, string destinationPath, CancellationToken ct)
    {
        var modelTarget = _storageConfig.GetModelPath("omnivoice");
        var model = await _modelRepo.GetByIdAsync("omnivoice", ct);
        if (model != null && !string.IsNullOrWhiteSpace(model.TargetDirectory))
        {
            modelTarget = model.TargetDirectory;
        }

        var resolvedModelDir = ModelPathResolver.Locate(modelTarget, _storageConfig.DataStorageDir);
        if (string.IsNullOrEmpty(resolvedModelDir))
        {
            throw new DomainConflictException($"Локальная модель OmniVoice не найдена на диске (ожидается в '{modelTarget}').", "OMNIVOICE_NOT_FOUND");
        }

        if (model != null && model.Status != ModelDownloadStatus.Ready)
        {
            var size = Directory.EnumerateFiles(resolvedModelDir, "*", SearchOption.AllDirectories).Sum(f => new FileInfo(f).Length);
            model.MarkReady(size);
            await _modelRepo.UpdateAsync(model, ct);
            await _modelRepo.SaveChangesAsync(ct);
        }

        var safeDest = _pathResolver.ResolveSafePath(destinationPath);
        var dir = Path.GetDirectoryName(safeDest);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        var payload = new
        {
            text,
            speaker_id = spec.SpeakerId,
            speed = spec.Speed,
            pitch = spec.Pitch,
            reference_audio = spec.ReferenceAudioPath,
            output_path = safeDest,
            model_dir = resolvedModelDir
        };

        var result = await _mlHost.ExecuteScriptAsync(
            scriptRelativePath: _storageConfig.GetScriptPath("omnivoice_tts.py"),
            jsonPayload: payload,
            contextName: "TTS_OmniVoice",
            acquireGpuLock: true,
            cancellationToken: ct);

        if (!File.Exists(safeDest))
        {
            throw new VoiceSynthesisException("Скрипт OmniVoice завершился успешно, но итоговый файл не был записан.", safeDest);
        }

        var fileInfo = new FileInfo(safeDest);
        double durationSeconds = ExtractDuration(result.StandardOutput, fileInfo.Length);

        return new RawSynthesisResult(safeDest, durationSeconds, fileInfo.Length);
    }

    private static double ExtractDuration(string standardOutput, long fileSizeBytes)
    {
        try
        {
            using var doc = JsonDocument.Parse(standardOutput);
            if (doc.RootElement.TryGetProperty("duration_seconds", out var d))
            {
                return d.GetDouble();
            }
        }
        catch { }

        return fileSizeBytes / (24000.0 * 2);
    }
}
