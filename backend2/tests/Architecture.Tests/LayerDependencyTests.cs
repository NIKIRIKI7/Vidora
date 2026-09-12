using NetArchTest.Rules;
using Xunit;

namespace Architecture.Tests;

public class LayerDependencyTests
{
    [Theory]
    [InlineData("MediaContext")]
    [InlineData("MotionContext")]
    [InlineData("ProductionContext")]
    [InlineData("Research")]
    [InlineData("Skills")]
    [InlineData("SystemContext")]
    [InlineData("Voice")]
    public void Domain_layer_must_be_pure(string context)
    {
        var forbidden = new List<string>
        {
            $"{context}.Application",
            $"{context}.Infrastructure",
            $"{context}.Contracts",
            "Api",
            "Integrations",
            "Microsoft.EntityFrameworkCore",
            "Microsoft.AspNetCore",
            "Microsoft.Extensions.DependencyInjection"
        };
        forbidden.AddRange(Arch.OtherContextsInnerLayers(context));

        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace($"{context}.Domain")
            .ShouldNot().HaveDependencyOnAny(forbidden.ToArray())
            .GetResult();

        Arch.AssertRule(result, $"DDD001: {context}.Domain должен быть чистым (только System, Kernel и собственный Domain)");
    }

    [Theory]
    [InlineData("MediaContext")]
    [InlineData("MotionContext")]
    [InlineData("ProductionContext")]
    [InlineData("Research")]
    [InlineData("Skills")]
    [InlineData("SystemContext")]
    [InlineData("Voice")]
    public void Application_layer_must_not_depend_on_infrastructure(string context)
    {
        var forbidden = new List<string>
        {
            $"{context}.Infrastructure",
            "Api",
            "Integrations",
            "Microsoft.EntityFrameworkCore",
            "Microsoft.AspNetCore"
        };
        forbidden.AddRange(Arch.OtherContextsInnerLayers(context));

        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace($"{context}.Application")
            .ShouldNot().HaveDependencyOnAny(forbidden.ToArray())
            .GetResult();

        Arch.AssertRule(result, $"DDD002: {context}.Application не должен зависеть от инфраструктуры, представления и чужих контекстов");
    }

    [Theory]
    [InlineData("MediaContext")]
    [InlineData("MotionContext")]
    [InlineData("ProductionContext")]
    [InlineData("Research")]
    [InlineData("Skills")]
    [InlineData("SystemContext")]
    [InlineData("Voice")]
    public void Infrastructure_must_not_depend_on_presentation_or_other_contexts(string context)
    {
        var forbidden = new List<string> { "Api" };
        forbidden.AddRange(Arch.OtherContextsInnerLayers(context));

        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace($"{context}.Infrastructure")
            .ShouldNot().HaveDependencyOnAny(forbidden.ToArray())
            .GetResult();

        Arch.AssertRule(result, $"DDD002: {context}.Infrastructure не должен зависеть от Api и чужих контекстов");
    }

    [Theory]
    [InlineData("MediaContext")]
    [InlineData("MotionContext")]
    [InlineData("ProductionContext")]
    [InlineData("Research")]
    [InlineData("Skills")]
    [InlineData("SystemContext")]
    [InlineData("Voice")]
    public void Contracts_must_not_depend_on_application_or_infrastructure(string context)
    {
        var forbidden = new List<string>
        {
            $"{context}.Application",
            $"{context}.Infrastructure",
            "Api",
            "Integrations"
        };
        forbidden.AddRange(Arch.OtherContextsInnerLayers(context));

        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace($"{context}.Contracts")
            .ShouldNot().HaveDependencyOnAny(forbidden.ToArray())
            .GetResult();

        Arch.AssertRule(result, $"DDD002: {context}.Contracts не должен зависеть от Application, Infrastructure и чужих контекстов");
    }

    [Fact]
    public void Api_must_not_depend_on_infrastructure_or_integrations()
    {
        var forbidden = Arch.BoundedContexts
            .Select(context => $"{context}.Infrastructure")
            .Append("Integrations")
            .Append("Microsoft.EntityFrameworkCore")
            .ToArray();

        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace("Api")
            .ShouldNot().HaveDependencyOnAny(forbidden)
            .GetResult();

        Arch.AssertRule(result, "DDD002: слой Api не должен знать об инфраструктуре и интеграциях, только о контрактах и портах");
    }

    [Fact]
    public void Kernel_must_not_depend_on_bounded_contexts_or_presentation()
    {
        var forbidden = Arch.BoundedContexts
            .SelectMany(Arch.InnerLayersOf)
            .Append("Api")
            .Append("Integrations")
            .ToArray();

        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace("Kernel")
            .ShouldNot().HaveDependencyOnAny(forbidden)
            .GetResult();

        Arch.AssertRule(result, "DDD005: общее ядро Kernel не должно зависеть от контекстов, Api и Integrations");
    }

    [Fact]
    public void Integrations_must_not_depend_on_bounded_contexts_or_presentation()
    {
        var forbidden = Arch.BoundedContexts
            .SelectMany(Arch.InnerLayersOf)
            .Append("Api")
            .ToArray();

        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace("Integrations")
            .ShouldNot().HaveDependencyOnAny(forbidden)
            .GetResult();

        Arch.AssertRule(result, "DDD005: общие интеграции не должны зависеть от контекстов и Api");
    }
}
