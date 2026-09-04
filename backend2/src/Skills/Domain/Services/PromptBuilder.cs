using System.Text;
using Skills.Domain.Entities;
using Skills.Domain.ValueObjects;

namespace Skills.Domain.Services;

public sealed record PromptCompositionResult(
    string ComposedPrompt,
    IReadOnlyList<Skill> IncludedSkills,
    IReadOnlyList<Skill> OmittedSkills,
    int TotalEstimatedTokens);

public sealed class PromptBuilder
{
    public const int DefaultBudgetTokens = 4000;

    public PromptCompositionResult BuildBundle(
        IEnumerable<Skill> skills,
        int? tokenLimit = null,
        string? customHeaderInstructions = null)
    {
        int budget = tokenLimit is > 0 ? tokenLimit.Value : DefaultBudgetTokens;

        var orderedSkills = skills
            .Where(s => s.IsEnabled)
            .OrderByDescending(s => s.Priority)
            .ThenBy(s => s.Name.Value, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var included = new List<Skill>();
        var omitted = new List<Skill>();
        var sb = new StringBuilder();

        if (!string.IsNullOrWhiteSpace(customHeaderInstructions))
        {
            sb.AppendLine(customHeaderInstructions.Trim());
            sb.AppendLine();
        }

        int currentEstimatedTokens = EstimateTokens(sb.ToString());

        foreach (var skill in orderedSkills)
        {
            var skillSection = FormatSkillSection(skill);
            int sectionTokens = skill.Content.EstimateTokens();

            if (currentEstimatedTokens + sectionTokens <= budget)
            {
                sb.AppendLine(skillSection);
                sb.AppendLine();
                currentEstimatedTokens += sectionTokens;
                included.Add(skill);
            }
            else
            {
                omitted.Add(skill);
            }
        }

        return new PromptCompositionResult(
            ComposedPrompt: sb.ToString().TrimEnd(),
            IncludedSkills: included,
            OmittedSkills: omitted,
            TotalEstimatedTokens: currentEstimatedTokens);
    }

    public static string FormatSkillSection(Skill skill)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"// === SKILL MODULE: {skill.Name} (Stage: {skill.Stage.ToSnakeCase()}, Priority: {skill.Priority}, Ver: {skill.Version}) ===");
        if (!string.IsNullOrWhiteSpace(skill.Description))
        {
            sb.AppendLine($"// Purpose: {skill.Description}");
        }
        sb.AppendLine(skill.Content.Value.Trim());
        return sb.ToString().TrimEnd();
    }

    /// <summary>
    /// Делегирует вычисление в единый канонический метод Value Object PromptContent (DRY).
    /// </summary>
    public static int EstimateTokens(string? text) => PromptContent.EstimateTokens(text);
}
