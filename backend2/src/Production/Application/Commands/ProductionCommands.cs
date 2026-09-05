using Kernel.Contracts;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Application.Commands;

public sealed record CreateProjectCommand(
    string Title,
    string? Slug = null,
    MontageSettingsDto? Montage = null);

public sealed record ParseScenarioCommand(
    ProjectId ProjectId,
    string MarkdownContent);

public sealed record UpdateSceneCommand(
    ProjectId ProjectId,
    SceneId SceneId,
    string? Title,
    string? VisualNote);

public sealed record ExecuteProjectPipelineCommand(
    ProjectId ProjectId,
    string SpeakerId,
    string? BgmAssetId,
    bool ForceRerender);

public sealed record CancelProjectPipelineCommand(ProjectId ProjectId);
public sealed record DeleteProjectCommand(ProjectId ProjectId);
