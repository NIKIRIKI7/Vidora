using Kernel.Exceptions;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Process;
using Voice.Domain;
using Voice.Domain.Exceptions;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers.Local;

public sealed class CosyVoiceTtsProvider : ITtsEngineProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.LocalCosyVoice;

    private readonly IMlProcessHost _mlHost;
    private readonly IPathResolver _pathResolver;

    public CosyVoiceTtsProvider(IMlProcessHost mlHost, IPathResolver pathResolver)
    {
        _mlHost = mlHost;
        _pathResolver = pathResolver;
    }

    public async Task<RawSynthesisResult> SynthesizeAsync(string text, VoiceSpec spec, string destinationPath, CancellationToken ct)
    {
        var modelDir = _pathResolver.ResolveSafePath("ai-models/cosyvoice");
        if (!Directory.Exists(modelDir))
        {
            throw new DomainConflictException("Каталог с моделью CosyVoice не найден: 'ai-models/cosyvoice'.", "COSYVOICE_NOT_FOUND");
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
            model_dir = modelDir
        };

        await _mlHost.ExecuteScriptAsync(
            scriptRelativePath: Path.Combine("tools", "scripts", "cosyvoice_tts.py"),
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
