using System.Text.Json.Serialization;

namespace Skills.Domain;

/// <summary>
/// Стадии конвейера производства видео и аналитики, для которых применяются специализированные скилы.
/// </summary>
[JsonConverter(typeof(JsonStringEnumConverter))]
public enum SkillStage
{
    [JsonStringEnumMemberName("scene_generation")]
    SceneGeneration,

    [JsonStringEnumMemberName("hook_analysis")]
    HookAnalysis,

    [JsonStringEnumMemberName("script_drafting")]
    ScriptDrafting,

    [JsonStringEnumMemberName("visual_analysis")]
    VisualAnalysis,

    [JsonStringEnumMemberName("trend_research")]
    TrendResearch
}

public static class SkillStageExtensions
{
    public static string ToSnakeCase(this SkillStage stage) => stage switch
    {
        SkillStage.SceneGeneration => "scene_generation",
        SkillStage.HookAnalysis => "hook_analysis",
        SkillStage.ScriptDrafting => "script_drafting",
        SkillStage.VisualAnalysis => "visual_analysis",
        SkillStage.TrendResearch => "trend_research",
        _ => stage.ToString().ToLowerInvariant()
    };

    public static bool TryParseStage(string? value, out SkillStage stage)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            stage = default;
            return false;
        }

        var normalized = value.Trim().Replace("-", "_").ToLowerInvariant();
        switch (normalized)
        {
            case "scene_generation":
            case "scenegeneration":
                stage = SkillStage.SceneGeneration;
                return true;
            case "hook_analysis":
            case "hookanalysis":
                stage = SkillStage.HookAnalysis;
                return true;
            case "script_drafting":
            case "scriptdrafting":
                stage = SkillStage.ScriptDrafting;
                return true;
            case "visual_analysis":
            case "visualanalysis":
                stage = SkillStage.VisualAnalysis;
                return true;
            case "trend_research":
            case "trendresearch":
                stage = SkillStage.TrendResearch;
                return true;
            default:
                return Enum.TryParse(value, true, out stage);
        }
    }

    public static SkillStage ParseStage(string? value)
    {
        if (TryParseStage(value, out var stage))
        {
            return stage;
        }

        throw new ArgumentException($"Неизвестная стадия скила: '{value}'");
    }
}
