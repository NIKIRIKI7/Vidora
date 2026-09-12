using System.Reflection;
using NetArchTest.Rules;
using Xunit;

namespace Architecture.Tests;

internal static class Arch
{
    public static readonly Assembly AssemblyUnderTest =
        typeof(MediaContext.Domain.Entities.MediaAsset).Assembly;

    public static readonly string[] BoundedContexts =
    [
        "MediaContext",
        "MotionContext",
        "ProductionContext",
        "Research",
        "Skills",
        "SystemContext",
        "Voice"
    ];

    public static string[] InnerLayersOf(string context) =>
    [
        $"{context}.Domain",
        $"{context}.Application",
        $"{context}.Infrastructure"
    ];

    public static string[] OtherContextsInnerLayers(string context) =>
        BoundedContexts
            .Where(candidate => candidate != context)
            .SelectMany(InnerLayersOf)
            .ToArray();

    public static void AssertRule(TestResult result, string rule)
    {
        if (result.IsSuccessful)
        {
            return;
        }

        var failures = result.FailingTypes
            .OrderBy(failure => failure.FullName)
            .Select(failure => string.IsNullOrWhiteSpace(failure.Explanation)
                ? failure.FullName
                : $"{failure.FullName}  [{failure.Explanation}]");

        var message = $"Нарушено DDD-правило: {rule}{Environment.NewLine}{string.Join(Environment.NewLine, failures)}";
        Assert.True(false, message);
    }
}
