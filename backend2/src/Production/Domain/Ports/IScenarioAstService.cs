using ProductionContext.Domain.Entities;
using ProductionContext.Domain.ScenarioEngine;
using ProductionContext.Domain.ValueObjects;

namespace ProductionContext.Domain.Ports;

/// <summary>
/// Контракт структурного домена (Левый блок): построение AST из Markdown,
/// сериализация AST обратно в канонический Markdown и маппинг в доменные сущности.
/// </summary>
public interface IScenarioAstService
{
    ScenarioAstDocument ParseToAst(string markdown);

    string SerializeAstToMarkdown(ScenarioAstDocument ast);

    IReadOnlyList<Scene> MapAstToEntities(ProjectId projectId, ScenarioAstDocument ast);
}
