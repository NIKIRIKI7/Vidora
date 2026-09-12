using Microsoft.Extensions.Logging;
using Voice.Domain.Ports;
using Voice.Domain.ValueObjects;

namespace Voice.Infrastructure.Providers;

public sealed class VoiceEngineCatalog : IVoiceEngineCatalog
{
    private readonly IEnumerable<IVoiceEngineDescriptor> _descriptors;
    private readonly ILocalTtsClient _localTtsClient;
    private readonly ILogger<VoiceEngineCatalog> _logger;

    public VoiceEngineCatalog(
        IEnumerable<IVoiceEngineDescriptor> descriptors,
        ILocalTtsClient localTtsClient,
        ILogger<VoiceEngineCatalog> logger)
    {
        _descriptors = descriptors;
        _localTtsClient = localTtsClient;
        _logger = logger;
    }

    public async Task<IReadOnlyList<VoiceEngineInfo>> DiscoverEnginesAsync(CancellationToken ct = default)
    {
        var results = new List<VoiceEngineInfo>();

        // 1. Статические движки (облачные дескрипторы)
        var tasks = _descriptors.Select(async desc =>
        {
            EngineReadiness readiness;
            try
            {
                readiness = await desc.ProbeReadinessAsync(ct);
            }
            catch (Exception ex)
            {
                readiness = EngineReadiness.NotReady($"Ошибка самодиагностики: {ex.Message}");
            }

            var caps = new List<string>();
            if (desc.Capabilities.HasFlag(VoiceCapabilities.Synthesis)) caps.Add("synthesis");
            if (desc.Capabilities.HasFlag(VoiceCapabilities.Clone)) caps.Add("clone");
            if (desc.Capabilities.HasFlag(VoiceCapabilities.Design)) caps.Add("design");
            if (desc.Capabilities.HasFlag(VoiceCapabilities.Streaming)) caps.Add("streaming");

            return new VoiceEngineInfo(
                Id: desc.EngineId,
                Name: desc.DisplayName,
                Mode: desc.Mode,
                Capabilities: caps,
                SupportsClone: desc.Capabilities.HasFlag(VoiceCapabilities.Clone),
                SupportsDesign: desc.Capabilities.HasFlag(VoiceCapabilities.Design),
                SupportsSynthesis: desc.Capabilities.HasFlag(VoiceCapabilities.Synthesis),
                IsAvailable: readiness.IsReady,
                StatusMessage: readiness.Reason,
                Description: desc.Description
            );
        });

        results.AddRange(await Task.WhenAll(tasks));

        // 2. Динамические движки локального ML-воркера (python_services/tts_engine)
        try
        {
            var localModels = await _localTtsClient.GetAvailableModelsAsync(ct);
            foreach (var localModel in localModels)
            {
                bool hasSynth = localModel.Capabilities.Contains("synthesis", StringComparer.OrdinalIgnoreCase);
                bool hasClone = localModel.Capabilities.Contains("clone", StringComparer.OrdinalIgnoreCase);
                bool hasDesign = localModel.Capabilities.Contains("design", StringComparer.OrdinalIgnoreCase);

                results.Add(new VoiceEngineInfo(
                    Id: localModel.Id,
                    Name: localModel.Name,
                    Mode: "local",
                    Capabilities: localModel.Capabilities,
                    SupportsClone: hasClone,
                    SupportsDesign: hasDesign,
                    SupportsSynthesis: hasSynth,
                    IsAvailable: true,
                    StatusMessage: "Готов (Local ML Worker)",
                    Description: "Локальная модель на базе GPU"
                ));
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogWarning(ex, "[VoiceEngineCatalog] Сбой получения локальных моделей ML-воркера.");
        }

        return results.OrderByDescending(r => r.IsAvailable).ThenBy(r => r.Name).ToList();
    }

    public IVoiceEngineDescriptor? FindDescriptor(string engineId) =>
        _descriptors.FirstOrDefault(d =>
            string.Equals(d.EngineId, engineId, StringComparison.OrdinalIgnoreCase));
}
