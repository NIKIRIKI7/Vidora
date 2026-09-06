using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Microsoft.Extensions.Options;
using Voice.Domain;
using Voice.Domain.Exceptions;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Local;

public sealed class CosyVoiceTtsProvider : ITtsEngineProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.LocalCosyVoice;

    private readonly IMlProcessHost _mlHost;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;

    public CosyVoiceTtsProvider(
        IMlProcessHost mlHost,
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig)
    {
        _mlHost = mlHost;
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
    }

    public async Task<RawSynthesisResult> SynthesizeAsync(string text, VoiceSpec spec, string destinationPath, CancellationToken ct)
    {
        var modelTarget = _storageConfig.GetModelPath("cosyvoice");
        var resolvedModelDir = ModelPathResolver.Locate(modelTarget, _storageConfig.DataStorageDir);
        if (string.IsNullOrEmpty(resolvedModelDir))
        {
            throw new DomainConflictException($"Каталог с моделью CosyVoice не найден: '{modelTarget}'.", "COSYVOICE_NOT_FOUND");
        }

        var safeDest = _pathResolver.ResolveSafePath(destinationPath);
        var dir = Path.GetDirectoryName(safeDest);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

        var payload = new
        {
            text,
            speaker_id = spec.SpeakerId,
            speed = spec.Speed,
            output_path = safeDest,
            model_dir = resolvedModelDir
        };

        await _mlHost.ExecuteScriptAsync(
            scriptRelativePath: _storageConfig.GetScriptPath("cosyvoice_tts.py"),
            jsonPayload: payload,
            contextName: "TTS_CosyVoice",
            acquireGpuLock: true,
            cancellationToken: ct);

        if (!File.Exists(safeDest))
        {
            throw new VoiceSynthesisException("Скрипт CosyVoice завершился без создания файла.", safeDest);
        }

        var fileInfo = new FileInfo(safeDest);
        return new RawSynthesisResult(safeDest, 1.0, fileInfo.Length);
    }
}
