using System.Text.Json.Serialization;
using Research.Domain;

namespace Research.Contracts;

public sealed record VideoCandidateDto(
    [property: JsonPropertyName("video_id")] string VideoId,
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("channel_title")] string ChannelTitle,
    [property: JsonPropertyName("subscribers")] long Subscribers,
    [property: JsonPropertyName("views")] long Views,
    [property: JsonPropertyName("published_at")] DateTimeOffset PublishedAt,
    [property: JsonPropertyName("duration_seconds")] double DurationSeconds,
    [property: JsonPropertyName("vph")] double ViewsPerHour,
    [property: JsonPropertyName("outlier_multiplier")] double OutlierMultiplier,
    [property: JsonPropertyName("momentum_score")] double MomentumScore,
    [property: JsonPropertyName("thumbnail_url")] string ThumbnailUrl);

public sealed record EarlySignalDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("topic")] string Topic,
    [property: JsonPropertyName("keywords")] IReadOnlyList<string> Keywords,
    [property: JsonPropertyName("growth_velocity_percent")] double GrowthVelocityPercent,
    [property: JsonPropertyName("video_count")] int VideoCount,
    [property: JsonPropertyName("aggregate_vph")] double AggregateVph,
    [property: JsonPropertyName("confidence")] double Confidence,
    [property: JsonPropertyName("source_url")] string SourceUrl = "",
    [property: JsonPropertyName("source_platform")] string SourcePlatform = "",
    [property: JsonPropertyName("growth_pct")] string GrowthPct = "");

public sealed record OpportunityDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("angle_title")] string AngleTitle,
    [property: JsonPropertyName("hook_hypothesis")] string HookHypothesis,
    [property: JsonPropertyName("target_audience")] string TargetAudience,
    [property: JsonPropertyName("recommended_format")] string RecommendedFormat,
    [property: JsonPropertyName("score")] double Score,
    [property: JsonPropertyName("friction_point")] string FrictionPoint,
    [property: JsonPropertyName("why_it_works")] string WhyItWorks,
    [property: JsonPropertyName("reference_video_ids")] IReadOnlyList<string> ReferenceVideoIds);

public sealed record ResearchRunSummaryDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("topic_query")] string TopicQuery,
    [property: JsonPropertyName("niche")] string Niche,
    [property: JsonPropertyName("status")] ResearchStatus Status,
    [property: JsonPropertyName("candidates_count")] int CandidatesCount,
    [property: JsonPropertyName("signals_count")] int SignalsCount,
    [property: JsonPropertyName("opportunities_count")] int OpportunitiesCount,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("completed_at")] DateTimeOffset? CompletedAt);

public sealed record ResearchRunDetailsDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("topic_query")] string TopicQuery,
    [property: JsonPropertyName("niche")] string Niche,
    [property: JsonPropertyName("status")] ResearchStatus Status,
    [property: JsonPropertyName("error_message")] string? ErrorMessage,
    [property: JsonPropertyName("candidates")] IReadOnlyList<VideoCandidateDto> Candidates,
    [property: JsonPropertyName("signals")] IReadOnlyList<EarlySignalDto> Signals,
    [property: JsonPropertyName("opportunities")] IReadOnlyList<OpportunityDto> Opportunities,
    [property: JsonPropertyName("created_at")] DateTimeOffset CreatedAt,
    [property: JsonPropertyName("completed_at")] DateTimeOffset? CompletedAt);

public sealed record StartResearchRequest(
    [property: JsonPropertyName("query")] string Query,
    [property: JsonPropertyName("niche")] string? Niche = null,
    [property: JsonPropertyName("max_candidates")] int MaxCandidates = 30);

public sealed record ResearchDagProgressDto(
    [property: JsonPropertyName("run_id")] string RunId,
    [property: JsonPropertyName("stage")] ResearchStatus Stage,
    [property: JsonPropertyName("progress_percentage")] double ProgressPercentage,
    [property: JsonPropertyName("message")] string Message,
    [property: JsonPropertyName("detected_signals_count")] int DetectedSignalsCount,
    [property: JsonPropertyName("synthesized_opportunities_count")] int SynthesizedOpportunitiesCount);
