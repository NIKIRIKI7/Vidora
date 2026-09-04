using Skills.Domain;

namespace Skills.Application.Commands;

public sealed record CreateCustomSkillCommand(
    string Id,
    string Name,
    string Description,
    SkillStage Stage,
    string Content,
    int Priority = 100,
    IReadOnlyList<string>? Tags = null);

public sealed record UpdateSkillCommand(
    string Id,
    string Name,
    string Description,
    string Content,
    int Priority,
    bool IsEnabled,
    IReadOnlyList<string>? Tags = null);

public sealed record ResetSkillToDefaultCommand(string Id);

public sealed record DeleteSkillCommand(string Id);
