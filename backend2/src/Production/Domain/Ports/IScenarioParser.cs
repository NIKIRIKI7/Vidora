using ProductionContext.Domain.Entities;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Domain.Ports;

public interface IScenarioParser
{
    IReadOnlyList<Scene> ParseMarkdown(ProjectId projectId, string markdownContent);
}
