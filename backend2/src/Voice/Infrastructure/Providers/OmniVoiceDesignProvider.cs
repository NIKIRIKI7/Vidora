using Integrations.OmniVoice.Audio;
using Integrations.OmniVoice.Contracts;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.Gpu;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers;

public sealed class OmniVoiceDesignProvider : IVoiceDesignProvider
{
    private readonly IOmniVoiceEngine _engine;
    private readonly IGpuManager _gpuManager;
    private readonly IPathResolver _pathResolver;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<OmniVoiceDesignProvider> _logger;

    public OmniVoiceDesignProvider(
        IOmniVoiceEngine engine,
        IGpuManager gpuManager,
        IPathResolver pathResolver,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<OmniVoiceDesignProvider> logger)
    {
        _engine = engine;
        _gpuManager = gpuManager;
        _pathResolver = pathResolver;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public async Task<DesignVoiceResult> DesignVoiceAsync(VoiceDesignSpec spec, CancellationToken ct = default)
    {
        _logger.LogInformation(
            "[Voice:OmniVoice:Design] Voice design by attributes: '{Desc}', Language: {Lang}",
            spec.Description, spec.Language);

        var speakerId = $"designed_{Guid.NewGuid():N}"[..16];
        var promptParts = new List<string> { spec.Description };

        if (!string.IsNullOrWhiteSpace(spec.Gender)) promptParts.Add(spec.Gender);
        if (!string.IsNullOrWhiteSpace(spec.AgeRange)) promptParts.Add(spec.AgeRange);
        if (!string.IsNullOrWhiteSpace(spec.Accent)) promptParts.Add(spec.Accent);
        if (!string.IsNullOrWhiteSpace(spec.Emotion)) promptParts.Add(spec.Emotion);
        if (!string.IsNullOrWhiteSpace(spec.Style)) promptParts.Add(spec.Style);
        promptParts.Add($"{spec.Language} language");

        var combinedPrompt = string.Join(", ", promptParts);

        await using (await _gpuManager.AcquireGpuLockAsync("OmniVoice_Design", ct))
        {
            var previewText = spec.Language.StartsWith("ru", StringComparison.OrdinalIgnoreCase)
                ? "Это демонстрация тембра, созданного в конструкторе голоса Vidora."
                : "This is a demonstration of the custom voice designed inside Vidora.";

            var synthesis = await _engine.SynthesizeWithDesignAsync(previewText, combinedPrompt, spec.Speed, 1.0, null, null, ct);

            var previewDir = _pathResolver.ResolveSafePath(Path.Combine(_storageConfig.DataStorageDir, "temp", "voice", "previews"));
            Directory.CreateDirectory(previewDir);
            var previewPath = Path.Combine(previewDir, $"{speakerId}_preview.wav");

            await WavAudioEncoder.WriteWavFileAsync(previewPath, synthesis.Samples, synthesis.SampleRate, ct);

            _logger.LogInformation(
                "[Voice:OmniVoice:Design] Voice designed: {SpeakerId}, Preview={Path}",
                speakerId, previewPath);

            return new DesignVoiceResult(speakerId, combinedPrompt, previewPath);
        }
    }
}
