using System.Text.Json.Serialization;

namespace ProductionContext.Domain.ScenarioEngine;

/// <summary>
/// Единая AST-модель сценария: промежуточный формат между Markdown (SCENARIO.md),
/// блочным редактором и базой данных. Генерируется левым блоком (Parser) и
/// потребляется центральным (LLM) и правым (Linter) блоками.
/// </summary>
public sealed record ScenarioAstDocument(
    [property: JsonPropertyName("frontmatter")] AstFrontmatter Frontmatter,
    [property: JsonPropertyName("scenes")] IReadOnlyList<AstScene> Scenes);

public sealed record AstFrontmatter(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("fps")] int Fps,
    [property: JsonPropertyName("aspect_ratio")] string AspectRatio,
    [property: JsonPropertyName("colors")] IReadOnlyDictionary<string, string> Colors);

public sealed record AstScene(
    [property: JsonPropertyName("title")] string Title,
    [property: JsonPropertyName("declared_timecode")] string? DeclaredTimecode,
    [property: JsonPropertyName("nodes")] IReadOnlyList<AstNode> Nodes);

[JsonDerivedType(typeof(AstFragment), typeDiscriminator: "fragment")]
[JsonDerivedType(typeof(AstTransition), typeDiscriminator: "transition")]
public abstract record AstNode;

public sealed record AstFragment(
    [property: JsonPropertyName("visual_note")] string VisualNote,
    [property: JsonPropertyName("spoken_text")] string SpokenText,
    [property: JsonPropertyName("declared_time_start")] string? DeclaredTimeStart,
    [property: JsonPropertyName("declared_time_end")] string? DeclaredTimeEnd,
    [property: JsonPropertyName("media_link")] string? MediaLink,
    [property: JsonPropertyName("animation_type")] string? AnimationType,
    [property: JsonPropertyName("animation_asset_link")] string? AnimationAssetLink,
    [property: JsonPropertyName("sfx_list")] IReadOnlyList<string> SfxList) : AstNode;

public sealed record AstTransition(
    [property: JsonPropertyName("transition_type")] string TransitionType,
    [property: JsonPropertyName("description")] string Description) : AstNode;
