using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Platform.WebSockets;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Research.Application.Pipelines;
using Research.Contracts;
using Research.Domain.Entities;
using Research.Domain.Ports;
using Research.Domain.ValueObjects;

namespace Research.Application.Services;

public sealed class ResearchModule : IResearchModule
{
    private readonly IResearchRunRepository _repository;
    private readonly IDeepTrendDagPipeline _pipeline;
    private readonly IResearchReportExporter _exporter;
    private readonly IYouTubeSearchIngestor _youtubeSearch;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ResearchModule> _logger;

    public ResearchModule(
        IResearchRunRepository repository,
        IDeepTrendDagPipeline pipeline,
        IResearchReportExporter exporter,
        IYouTubeSearchIngestor youtubeSearch,
        IServiceProvider serviceProvider,
        ILogger<ResearchModule> logger)
    {
        _repository = repository;
        _pipeline = pipeline;
        _exporter = exporter;
        _youtubeSearch = youtubeSearch;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task<ResearchRunSummaryDto> StartSessionAsync(StartResearchRequest request, CancellationToken ct = default)
    {
        var runId = ResearchRunId.New();
        var run = ResearchRun.StartNew(runId, request.Query, request.Niche);

        await _repository.AddAsync(run, ct);
        await _repository.SaveChangesAsync(ct);

        _logger.LogInformation("[ResearchModule] Создана сессия исследования: {RunId} ({Query})", run.Id.Value, run.TopicQuery);

        _ = Task.Run(async () =>
        {
            using var scope = _serviceProvider.CreateScope();
            var pipeline = scope.ServiceProvider.GetRequiredService<IDeepTrendDagPipeline>();
            var repo = scope.ServiceProvider.GetRequiredService<IResearchRunRepository>();
            var gateway = scope.ServiceProvider.GetRequiredService<IWebSocketGateway>();
            try
            {
                await foreach (var progress in pipeline.RunAsync(run, request.MaxCandidates, CancellationToken.None))
                {
                    await repo.UpdateAsync(run, CancellationToken.None);
                    await repo.SaveChangesAsync(CancellationToken.None);

                    await gateway.BroadcastAsync("RESEARCH_PROGRESS", progress, CancellationToken.None);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[ResearchModule] Сбой выполнения DAG для {RunId}", run.Id.Value);
                run.MarkFailed(ex.Message);
                await repo.UpdateAsync(run, CancellationToken.None);
                await repo.SaveChangesAsync(CancellationToken.None);
            }
        });

        return MapSummary(run);
    }

    public async Task<ResearchRunDetailsDto> GetSessionByIdAsync(string runId, CancellationToken ct = default)
    {
        var id = ParseRunId(runId);
        var run = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("ResearchRun", runId);

        return MapDetails(run);
    }

    public async Task<PagedResult<ResearchRunSummaryDto>> GetSessionsPagedAsync(int page = 1, int pageSize = 20, CancellationToken ct = default)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 100);

        int total = await _repository.CountAsync(ct);
        var runs = await _repository.GetAllAsync((page - 1) * pageSize, pageSize, ct);

        return PagedResult<ResearchRunSummaryDto>.Create(
            runs.Select(MapSummary).ToList(),
            total,
            page,
            pageSize);
    }

    public async Task<IReadOnlyList<OpportunityDto>> GetOpportunitiesAsync(string runId, CancellationToken ct = default)
    {
        var id = ParseRunId(runId);
        var run = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("ResearchRun", runId);

        return run.Opportunities.Select(MapOpportunity).ToList();
    }

    public async Task<byte[]> ExportExcelReportAsync(string runId, CancellationToken ct = default)
    {
        var id = ParseRunId(runId);
        var run = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("ResearchRun", runId);

        return await _exporter.ExportToExcelAsync(run, ct);
    }

    public async Task CancelSessionAsync(string runId, CancellationToken ct = default)
    {
        var id = ParseRunId(runId);
        var run = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("ResearchRun", runId);

        run.Cancel();
        await _repository.UpdateAsync(run, ct);
        await _repository.SaveChangesAsync(ct);
    }

    public async IAsyncEnumerable<ResearchDagProgressDto> ExecuteDagStreamingAsync(
        string runId,
        [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct = default)
    {
        var id = ParseRunId(runId);
        var run = await _repository.GetByIdAsync(id, ct)
            ?? throw new ResourceNotFoundException("ResearchRun", runId);

        await foreach (var step in _pipeline.RunAsync(run, 30, ct))
        {
            await _repository.UpdateAsync(run, ct);
            await _repository.SaveChangesAsync(ct);
            yield return step;
        }
    }

    private static ResearchRunId ParseRunId(string raw)
    {
        if (!ResearchRunId.TryParse(raw, out var id))
        {
            throw new ResourceNotFoundException("ResearchRun", raw);
        }
        return id;
    }

    private static ResearchRunSummaryDto MapSummary(ResearchRun r) => new(
        r.Id.Value,
        r.TopicQuery,
        r.Niche,
        r.Status,
        r.Candidates.Count,
        r.Signals.Count,
        r.Opportunities.Count,
        r.CreatedAt,
        r.CompletedAt);

    private static ResearchRunDetailsDto MapDetails(ResearchRun r) => new(
        r.Id.Value,
        r.TopicQuery,
        r.Niche,
        r.Status,
        r.ErrorMessage,
        r.Candidates.Select(MapCandidate).ToList(),
        r.Signals.Select(MapSignal).ToList(),
        r.Opportunities.Select(MapOpportunity).ToList(),
        r.CreatedAt,
        r.CompletedAt);

    private static VideoCandidateDto MapCandidate(VideoCandidate c) => new(
        c.VideoId,
        c.Title,
        c.ChannelTitle,
        c.ChannelSubscriberCount,
        c.ViewCount,
        c.PublishedAt,
        c.DurationSeconds,
        c.Momentum.ViewsPerHour,
        c.Momentum.OutlierMultiplier,
        c.Momentum.Score,
        c.ThumbnailUrl);

    private static EarlySignalDto MapSignal(EarlySignal s) => new(
        s.Id,
        s.Topic,
        System.Text.Json.JsonSerializer.Deserialize<List<string>>(s.KeywordClusterJson) ?? [],
        s.GrowthVelocityPercent,
        s.SupportingVideoCount,
        s.AggregateVph,
        s.Confidence,
        s.SourceUrl,
        s.SourcePlatform,
        s.GrowthPct);

    private static OpportunityDto MapOpportunity(Opportunity o) => new(
        o.Id,
        o.AngleTitle,
        o.HookHypothesis,
        o.TargetAudience,
        o.RecommendedFormat,
        o.Score.Value,
        o.FrictionPoint,
        o.WhyItWorks,
        System.Text.Json.JsonSerializer.Deserialize<List<string>>(o.ReferenceVideoIdsJson) ?? []);

    public async Task<IReadOnlyList<string>> GetTrendingHooksAsync(string topic, int max = 5, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(topic)) return [];

        try
        {
            var results = await _youtubeSearch.SearchTopicCandidatesAsync(
                query: topic,
                maxResults: max,
                daysBack: 14,
                lang: "ru",
                ct: ct);

            return results
                .Where(r => r.ViewCount > 0)
                .OrderByDescending(r => r.ViewCount)
                .Take(max)
                .Select(r => $"- \"{r.Title}\" — {r.ViewCount:N0} просмотров (канал: {r.ChannelTitle})")
                .ToList();
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            _logger.LogDebug(ex, "[ResearchModule] Не удалось получить трендовые хуки для '{Topic}'", topic);
            return [];
        }
    }
}
