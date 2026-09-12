using NetArchTest.Rules;
using Xunit;

namespace Architecture.Tests;

public class BoundedContextIsolationTests
{
    public static IEnumerable<object[]> ContextPairs()
    {
        foreach (var source in Arch.BoundedContexts)
        {
            foreach (var target in Arch.BoundedContexts)
            {
                if (source == target)
                {
                    continue;
                }

                yield return [source, target];
            }
        }
    }

    [Theory]
    [MemberData(nameof(ContextPairs))]
    public void Context_must_not_reach_into_another_context_internals(string source, string target)
    {
        var forbidden = Arch.InnerLayersOf(target);

        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace($"{source}.")
            .ShouldNot().HaveDependencyOnAny(forbidden)
            .GetResult();

        Arch.AssertRule(
            result,
            $"DDD004: {source} не должен зависеть от {target}.Domain, {target}.Application или {target}.Infrastructure (только через {target}.Contracts)");
    }
}
