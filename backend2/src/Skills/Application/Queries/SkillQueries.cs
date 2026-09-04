using Skills.Domain;

namespace Skills.Application.Queries;

public sealed record GetSkillsByStageQuery(SkillStage Stage, bool OnlyEnabled = false);
public sealed record GetSkillByIdQuery(string Id);
public sealed record GetAllSkillsQuery();
