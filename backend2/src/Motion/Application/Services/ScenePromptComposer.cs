using System.Text.Json;
using Kernel.Ports;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;
using Skills.Contracts;
using Skills.Domain;

namespace MotionContext.Application.Services;

public sealed class ScenePromptComposer : IScenePromptComposer
{
    private readonly ISkillsCatalog _skillsCatalog;
    private readonly IPackageCapabilityRegistry _capabilityRegistry;

    public ScenePromptComposer(
        ISkillsCatalog skillsCatalog,
        IPackageCapabilityRegistry capabilityRegistry)
    {
        _skillsCatalog = skillsCatalog;
        _capabilityRegistry = capabilityRegistry;
    }

    public async Task<LlmPromptSpec> ComposePromptSpecAsync(
        string projectId,
        string sceneId,
        string visualDescription,
        string voiceText,
        CompositionConfig composition,
        MontageTheme theme,
        IReadOnlyList<string> activeCapabilities,
        CancellationToken ct = default)
    {
        var promptBundle = await _skillsCatalog.GetSkillBundleForStageAsync(
            SkillStage.SceneGeneration,
            maxTokenLimit: 3800,
            customHeaderInstructions: "Generate strictly self-contained React TSX component for Remotion.",
            cancellationToken: ct);

        var capabilityGuidelines = _capabilityRegistry.GetCombinedPromptGuidelines(activeCapabilities);

        var systemPrompt = $"""
            {promptBundle.SystemPrompt}

            // === INSTALLED PACKAGES & CONSTRAINTS ===
            {capabilityGuidelines}

            Output valid React TSX code directly without markdown formatting or enclosed in markdown code fences.
            """;

        var userPrompt = $"""
            Create scene TSX component:
            - Project: {projectId}, Scene: {sceneId}
            - Visual Note: {visualDescription}
            - Voice Text: "{voiceText}"
            - Dimensions: {composition.Width}x{composition.Height}
            - Duration: {composition.DurationInFrames} frames ({composition.DurationSeconds:F1}s at {composition.Fps} fps)
            - Montage Theme: {JsonSerializer.Serialize(theme)}
            """;

        return new LlmPromptSpec(
            Messages:
            [
                new LlmPromptMessage("system", systemPrompt),
                new LlmPromptMessage("user", userPrompt)
            ],
            Temperature: 0.2f,
            MaxTokens: 4000);
    }
}
