using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Application.Queries;

public sealed record GetProjectByIdQuery(ProjectId ProjectId);
public sealed record GetProjectsPagedQuery(int Page = 1, int PageSize = 20);
