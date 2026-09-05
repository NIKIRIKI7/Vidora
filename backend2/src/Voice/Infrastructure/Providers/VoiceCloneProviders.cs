using Kernel.Platform.Process;
using Microsoft.Extensions.Logging;
using Voice.Domain;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers;

public sealed class OmniVoiceCloneProvider : IVoiceCloneProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.LocalOmniVoice;

    private readonly IMlProcessHost _mlHost;
    private readonly ILogger<OmniVoiceCloneProvider> _logger;

    public OmniVoiceCloneProvider(IMlProcessHost mlHost, ILogger<OmniVoiceCloneProvider> logger)
    {
        _mlHost = mlHost;
        _logger = logger;
    }

    public bool SupportsEngine(VoiceEngineType engine) => engine == VoiceEngineType.LocalOmniVoice;

    public async Task<CloneVoiceResult> CloneVoiceAsync(ClonedVoiceSpec spec, CancellationToken ct = default)
    {
        _logger.LogInformation("[OmniVoiceClone] Клонирование голоса: '{Name}', audio={Audio}",
            spec.Name, spec.ReferenceAudioPath);

        var payload = new
        {
            reference_audio = spec.ReferenceAudioPath,
            reference_text = spec.ReferenceText,
            name = spec.Name,
            language = spec.Language
        };

        var result = await _mlHost.ExecuteScriptAsync(
            scriptRelativePath: Path.Combine("tools", "scripts", "omnivoice_clone.py"),
            jsonPayload: payload,
            contextName: "VoiceClone_OmniVoice",
            acquireGpuLock: true,
            cancellationToken: ct);

        var speakerId = $"clone_{Guid.NewGuid():N}"[..16];
        var previewPath = ExtractPreviewPath(result.StandardOutput);

        return new CloneVoiceResult(speakerId, previewPath ?? spec.ReferenceAudioPath);
    }

    private static string? ExtractPreviewPath(string standardOutput)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(standardOutput);
            if (doc.RootElement.TryGetProperty("preview_audio_path", out var path))
                return path.GetString();
        }
        catch { }
        return null;
    }
}

public sealed class MiniMaxCloneProvider : IVoiceCloneProvider
{
    public VoiceEngineType EngineType => VoiceEngineType.CloudMiniMax;

    private readonly IMlProcessHost _mlHost;
    private readonly ILogger<MiniMaxCloneProvider> _logger;

    public MiniMaxCloneProvider(IMlProcessHost mlHost, ILogger<MiniMaxCloneProvider> logger)
    {
        _mlHost = mlHost;
        _logger = logger;
    }

    public bool SupportsEngine(VoiceEngineType engine) => engine == VoiceEngineType.CloudMiniMax;

    public async Task<CloneVoiceResult> CloneVoiceAsync(ClonedVoiceSpec spec, CancellationToken ct = default)
    {
        _logger.LogInformation("[MiniMaxClone] Клонирование голоса через MiniMax: '{Name}'", spec.Name);

        var payload = new
        {
            reference_audio = spec.ReferenceAudioPath,
            reference_text = spec.ReferenceText,
            name = spec.Name,
            language = spec.Language
        };

        var result = await _mlHost.ExecuteScriptAsync(
            scriptRelativePath: Path.Combine("tools", "scripts", "minimax_clone.py"),
            jsonPayload: payload,
            contextName: "VoiceClone_MiniMax",
            acquireGpuLock: false,
            cancellationToken: ct);

        var speakerId = $"clone_mm_{Guid.NewGuid():N}"[..16];
        var previewPath = ExtractPreviewPath(result.StandardOutput);

        return new CloneVoiceResult(speakerId, previewPath ?? spec.ReferenceAudioPath);
    }

    private static string? ExtractPreviewPath(string standardOutput)
    {
        try
        {
            using var doc = System.Text.Json.JsonDocument.Parse(standardOutput);
            if (doc.RootElement.TryGetProperty("preview_audio_path", out var path))
                return path.GetString();
        }
        catch { }
        return null;
    }
}
