using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Application.Services;

public interface IProductionPipelineOrchestrator
{
    Task ExecuteAsync(
        ProjectId projectId,
        string speakerId,
        string? bgmAssetId,
        bool forceRerender,
        CancellationToken ct = default);
}
