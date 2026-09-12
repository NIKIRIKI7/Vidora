using Kernel.Contracts;
using Research.Domain.ValueObjects;

namespace Research.Contracts;

public interface IResearchModule
{
    Task<ResearchRunSummaryDto> StartSessionAsync(StartResearchRequest request, CancellationToken ct = default);
    Task<ResearchRunDetailsDto> GetSessionByIdAsync(string runId, CancellationToken ct = default);
    Task<PagedResult<ResearchRunSummaryDto>> GetSessionsPagedAsync(int page = 1, int pageSize = 20, CancellationToken ct = default);
    Task<IReadOnlyList<OpportunityDto>> GetOpportunitiesAsync(string runId, CancellationToken ct = default);
    Task<byte[]> ExportExcelReportAsync(string runId, CancellationToken ct = default);
    Task CancelSessionAsync(string runId, CancellationToken ct = default);
    IAsyncEnumerable<ResearchDagProgressDto> ExecuteDagStreamingAsync(string runId, CancellationToken ct = default);
    Task<IReadOnlyList<string>> GetTrendingHooksAsync(string topic, int max = 5, CancellationToken ct = default);
}
