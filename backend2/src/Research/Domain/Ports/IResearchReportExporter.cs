using System.Text.Json.Serialization;
using Research.Domain.Entities;

namespace Research.Domain.Ports;

public sealed record AdHocVideoExportDto(
    [property: JsonPropertyName("video_id")] string VideoId,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("channel")] string Channel,
    [property: JsonPropertyName("views")] long Views,
    [property: JsonPropertyName("subs")] long Subs,
    [property: JsonPropertyName("ratio")] double Ratio,
    [property: JsonPropertyName("vph")] double Vph,
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("published_at")] string PublishedAt,
    [property: JsonPropertyName("duration_sec")] int DurationSec,
    [property: JsonPropertyName("is_short")] bool IsShort,
    [property: JsonPropertyName("is_rocket")] bool IsRocket,
    [property: JsonPropertyName("velocity_stage")] string VelocityStage);

public sealed record AdHocSignalExportDto(
    [property: JsonPropertyName("topic")] string Topic,
    [property: JsonPropertyName("vps_score")] double VpsScore,
    [property: JsonPropertyName("aggregate_vph")] double AggregateVph,
    [property: JsonPropertyName("supporting_videos")] int SupportingVideos,
    [property: JsonPropertyName("source_platform")] string SourcePlatform,
    [property: JsonPropertyName("growth_pct")] string GrowthPct,
    [property: JsonPropertyName("source_url")] string SourceUrl);

public sealed record AdHocOpportunityExportDto(
    [property: JsonPropertyName("topic")] string Topic,
    [property: JsonPropertyName("opportunity_score")] double OpportunityScore,
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("actionable_angle")] string ActionableAngle,
    [property: JsonPropertyName("demand_source")] string DemandSource);

public sealed record AdHocGoldmineExportDto(
    [property: JsonPropertyName("video_title")] string VideoTitle,
    [property: JsonPropertyName("category")] string Category,
    [property: JsonPropertyName("viewer_quote")] string ViewerQuote,
    [property: JsonPropertyName("insight")] string Insight,
    [property: JsonPropertyName("script_solution")] string ScriptSolution);

public sealed record AdHocExportData(
    [property: JsonPropertyName("query")] string Query,
    [property: JsonPropertyName("niche")] string? Niche,
    [property: JsonPropertyName("videos")] IReadOnlyList<AdHocVideoExportDto> Videos,
    [property: JsonPropertyName("signals")] IReadOnlyList<AdHocSignalExportDto> Signals,
    [property: JsonPropertyName("opportunities")] IReadOnlyList<AdHocOpportunityExportDto> Opportunities,
    [property: JsonPropertyName("goldmine")] IReadOnlyList<AdHocGoldmineExportDto> Goldmine);

public interface IResearchReportExporter
{
    Task<byte[]> ExportToExcelAsync(ResearchRun run, CancellationToken ct = default);
    Task<byte[]> ExportAdHocToExcelAsync(AdHocExportData data, CancellationToken ct = default);
}
