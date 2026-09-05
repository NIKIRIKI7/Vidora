using Kernel.Contracts;

namespace ProductionContext.Contracts;

public interface IProductionModule
{
    Task<ProjectDetailsDto> CreateProjectAsync(CreateProjectRequest request, CancellationToken ct = default);
    Task<ProjectDetailsDto> GetProjectByIdAsync(string projectId, CancellationToken ct = default);
    Task<PagedResult<ProjectSummaryDto>> GetProjectsPagedAsync(int page = 1, int pageSize = 20, CancellationToken ct = default);
    Task<ProjectDetailsDto> ParseScenarioAsync(string projectId, ParseScenarioRequest request, CancellationToken ct = default);
    Task<ProjectDetailsDto> UpdateSceneAsync(string projectId, string sceneId, UpdateSceneRequest request, CancellationToken ct = default);
    Task<BuildStatusDto> BuildProjectAsync(string projectId, BuildProjectRequest? request = null, CancellationToken ct = default);
    Task CancelBuildAsync(string projectId, CancellationToken ct = default);
    Task DeleteProjectAsync(string projectId, CancellationToken ct = default);
    Task<BuildStatusDto> GetBuildStatusAsync(string projectId, CancellationToken ct = default);
    Task<ProjectDataDto> ExportProjectBridgeSnapshotAsync(string projectId, CancellationToken ct = default);
}
