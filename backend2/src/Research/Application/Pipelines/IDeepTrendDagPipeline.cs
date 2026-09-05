using Research.Contracts;
using Research.Domain.Entities;

namespace Research.Application.Pipelines;

public interface IDeepTrendDagPipeline
{
    IAsyncEnumerable<ResearchDagProgressDto> RunAsync(ResearchRun run, int maxCandidates = 30, CancellationToken ct = default);
}
