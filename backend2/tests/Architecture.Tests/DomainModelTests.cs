using NetArchTest.Rules;
using Xunit;

namespace Architecture.Tests;

public class DomainModelTests
{
    [Theory]
    [InlineData("MediaContext")]
    [InlineData("MotionContext")]
    [InlineData("ProductionContext")]
    [InlineData("Research")]
    [InlineData("Skills")]
    [InlineData("SystemContext")]
    [InlineData("Voice")]
    public void Domain_events_must_follow_naming_convention(string context)
    {
        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace($"{context}.Domain.Events")
            .Should().HaveNameEndingWith("Event")
            .GetResult();

        Arch.AssertRule(result, $"DDD010: доменные события {context}.Domain.Events должны называться в прошедшем времени (суффикс Event)");
    }

    [Theory]
    [InlineData("MediaContext")]
    [InlineData("MotionContext")]
    [InlineData("ProductionContext")]
    [InlineData("Research")]
    [InlineData("Skills")]
    [InlineData("SystemContext")]
    [InlineData("Voice")]
    public void Value_objects_must_be_immutable(string context)
    {
        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace($"{context}.Domain.ValueObjects")
            .And().AreNotEnums()
            .And().AreNotStatic()
            .Should().BeImmutable()
            .GetResult();

        Arch.AssertRule(result, $"DDD009: объекты-значения {context}.Domain.ValueObjects должны быть неизменяемыми");
    }

    [Theory]
    [InlineData("MediaContext")]
    [InlineData("MotionContext")]
    [InlineData("ProductionContext")]
    [InlineData("Research")]
    [InlineData("Skills")]
    [InlineData("SystemContext")]
    [InlineData("Voice")]
    public void Infrastructure_must_not_expose_ports(string context)
    {
        var result = Types.InAssembly(Arch.AssemblyUnderTest)
            .That().ResideInNamespace($"{context}.Infrastructure")
            .And().AreInterfaces()
            .ShouldNot().BePublic()
            .GetResult();

        Arch.AssertRule(result, $"DDD003: порты не должны быть публичными интерфейсами в {context}.Infrastructure (перенесите их в {context}.Domain.Ports)");
    }
}
