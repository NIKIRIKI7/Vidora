using Kernel.Platform.Process;
using Microsoft.Extensions.Logging;
using Voice.Domain;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers;

public sealed class OmniVoiceDesignProvider : IVoiceDesignProvider
{
    private readonly IMlProcessHost _mlHost;
    private readonly ILogger<OmniVoiceDesignProvider> _logger;

    public OmniVoiceDesignProvider(IMlProcessHost mlHost, ILogger<OmniVoiceDesignProvider> logger)
    {
        _mlHost = mlHost;
        _logger = logger;
    }

    public async Task<DesignVoiceResult> DesignVoiceAsync(VoiceDesignSpec spec, CancellationToken ct = default)
    {
        _logger.LogInformation("[OmniVoiceDesign] Дизайн голоса: '{Desc}', язык={Lang}, пол={Gender}",
            spec.Description, spec.Language, spec.Gender);

        var payload = new
        {
            description = spec.Description,
            language = spec.Language,
            gender = spec.Gender,
            age_range = spec.AgeRange,
            accent = spec.Accent,
            emotion = spec.Emotion,
            style = spec.Style,
            speed = spec.Speed
        };

        var result = await _mlHost.ExecuteScriptAsync(
            scriptRelativePath: Path.Combine("tools", "scripts", "omnivoice_design.py"),
            jsonPayload: payload,
            contextName: "VoiceDesign_OmniVoice",
            acquireGpuLock: true,
            cancellationToken: ct);

        var speakerId = $"designed_{Guid.NewGuid():N}"[..16];
        var previewPath = ExtractPreviewPath(result.StandardOutput);

        return new DesignVoiceResult(speakerId, spec.Description, previewPath);
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
