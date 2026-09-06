using System.Text;
using System.Text.Json;
using Integrations.YouTube.Innertube.Config;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Integrations.YouTube.Innertube.Diagnostics;

public sealed class SchemaDriftEntry
{
    public string RendererKey { get; init; } = string.Empty;
    public string PropertyPath { get; init; } = string.Empty;
    public string ExpectedType { get; init; } = string.Empty;
    public string ActualType { get; init; } = string.Empty;
    public DateTime DetectedAt { get; init; } = DateTime.UtcNow;
}

public sealed class SchemaDriftReport
{
    public List<SchemaDriftEntry> Drifts { get; init; } = [];
    public int TotalChecked { get; init; }
    public bool HasDrift => Drifts.Count > 0;
}

public sealed class TopologyNode
{
    public string Name { get; init; } = string.Empty;
    public string Type { get; init; } = string.Empty;
    public int ChildCount { get; init; }
    public List<TopologyNode> Children { get; init; } = [];
}

public interface IInnerTubeDiagnostics
{
    TopologyNode BuildTopologyTree(JsonElement root, string? label = null);
    string BuildFormattedSnippet(JsonElement element, int maxDepth = 3);
    SchemaDriftReport DetectSchemaDrift(JsonElement root, InnerTubeSchemaConfig schema);
}

public sealed class InnerTubeDiagnostics : IInnerTubeDiagnostics
{
    private readonly InnerTubeOptions _options;
    private readonly ILogger<InnerTubeDiagnostics> _logger;
    private readonly List<SchemaDriftEntry> _driftBuffer = [];

    public InnerTubeDiagnostics(
        IOptions<InnerTubeOptions> options,
        ILogger<InnerTubeDiagnostics> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public TopologyNode BuildTopologyTree(JsonElement root, string? label = null)
    {
        var node = new TopologyNode
        {
            Name = label ?? root.ToString().Take(50).ToString() ?? "root",
            Type = root.ValueKind.ToString(),
            ChildCount = root.ValueKind == JsonValueKind.Object
                ? root.EnumerateObject().Count()
                : root.ValueKind == JsonValueKind.Array
                    ? root.GetArrayLength()
                    : 0
        };

        if (root.ValueKind == JsonValueKind.Object)
        {
            foreach (var prop in root.EnumerateObject().Take(20))
            {
                node.Children.Add(BuildTopologyTree(prop.Value, prop.Name));
            }
        }
        else if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() > 0)
        {
            node.Children.Add(BuildTopologyTree(root[0], "[0]"));
        }

        return node;
    }

    public string BuildFormattedSnippet(JsonElement element, int maxDepth = 3)
    {
        var sb = new StringBuilder();
        BuildSnippetRecursive(element, sb, 0, maxDepth);
        return sb.ToString();
    }

    public SchemaDriftReport DetectSchemaDrift(JsonElement root, InnerTubeSchemaConfig schema)
    {
        _driftBuffer.Clear();
        var totalChecked = 0;

        CheckRenderer(root, schema.VideoRendererKey, "videoRenderer", ref totalChecked);
        CheckRenderer(root, schema.CompactVideoRendererKey, "compactVideoRenderer", ref totalChecked);

        var report = new SchemaDriftReport
        {
            Drifts = [.. _driftBuffer],
            TotalChecked = totalChecked
        };

        if (report.HasDrift)
        {
            _logger.LogWarning(
                "[InnerTube Diagnostics] Schema drift detected: {Count} drifts in {Total} checks",
                report.Drifts.Count, report.TotalChecked);
        }

        return report;
    }

    private void CheckRenderer(JsonElement root, string rendererKey, string rendererLabel, ref int totalChecked)
    {
        totalChecked++;
        if (root.TryGetProperty(rendererKey, out var renderer))
        {
            _logger.LogDebug(
                "[Schema] Found renderer {Renderer} with {Props} properties",
                rendererLabel, renderer.ValueKind == JsonValueKind.Object ? renderer.EnumerateObject().Count() : 0);
        }
    }

    private void BuildSnippetRecursive(JsonElement element, StringBuilder sb, int depth, int maxDepth)
    {
        if (depth >= maxDepth) { sb.Append("..."); return; }

        var indent = new string(' ', depth * 2);
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                sb.AppendLine($"{indent}{{");
                var props = element.EnumerateObject().Take(10);
                foreach (var prop in props)
                {
                    sb.Append($"{indent}  {prop.Name}: ");
                    BuildSnippetRecursive(prop.Value, sb, depth + 1, maxDepth);
                    sb.AppendLine();
                }
                sb.Append($"{indent}}}");
                break;
            case JsonValueKind.Array:
                var arrLen = element.GetArrayLength();
                sb.AppendLine($"{indent}[{arrLen} items]");
                if (arrLen > 0)
                    BuildSnippetRecursive(element[0], sb, depth + 1, maxDepth);
                break;
            case JsonValueKind.String:
                var str = element.GetString() ?? "";
                sb.Append(str.Length > 50 ? $"\"{str[..50]}...\"" : $"\"{str}\"");
                break;
            case JsonValueKind.Number:
                sb.Append(element.ToString());
                break;
            case JsonValueKind.True:
            case JsonValueKind.False:
                sb.Append(element.GetBoolean());
                break;
            case JsonValueKind.Null:
                sb.Append("null");
                break;
        }
    }
}

public static class InnerTubeDiagnosticsExtensions
{
    public static bool TryGetWithDiagnostics(
        this IInnerTubeDiagnostics diagnostics,
        JsonElement element,
        string propertyName,
        out JsonElement result,
        string? context = null)
    {
        if (element.TryGetProperty(propertyName, out result))
            return true;

        diagnostics.BuildFormattedSnippet(element);
        return false;
    }
}
