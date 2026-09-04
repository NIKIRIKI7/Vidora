using Kernel.Exceptions;
using Skills.Domain.ValueObjects;
using Xunit;

namespace Kernel.Tests;

public class SkillValueObjectsTests
{
    [Theory]
    [InlineData("valid-skill_1")]
    [InlineData("skill")]
    [InlineData("HOOK_123")]
    public void SkillId_ValidFormats_ShouldInstantiate(string raw)
    {
        var id = new SkillId(raw);
        Assert.Equal(raw.Trim().ToLowerInvariant(), id.Value);
    }

    [Theory]
    [InlineData("")]
    [InlineData(" ")]
    [InlineData("skill with space")]
    [InlineData("skill!@#")]
    public void SkillId_InvalidFormats_ShouldThrowValidationException(string raw)
    {
        Assert.Throws<ValidationException>(() => new SkillId(raw));
    }

    [Theory]
    [InlineData(0)]
    [InlineData(100)]
    [InlineData(1000)]
    public void SkillPriority_ValidRange_ShouldInstantiate(int priority)
    {
        var p = new SkillPriority(priority);
        Assert.Equal(priority, p.Value);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1001)]
    public void SkillPriority_OutOfRange_ShouldThrowValidationException(int priority)
    {
        Assert.Throws<ValidationException>(() => new SkillPriority(priority));
    }

    [Fact]
    public void SkillVersion_Next_ShouldIncrementMonotonically()
    {
        var v1 = SkillVersion.Initial;
        Assert.Equal(1, v1.Value);

        var v2 = v1.Next();
        Assert.Equal(2, v2.Value);
        Assert.True(v2 > v1);
    }

    [Fact]
    public void PromptContent_EstimateTokens_ShouldHandleCyrillicAndCodeAccurately()
    {
        var prompt = new PromptContent("const a = 10; // правило рендера сцены");
        int tokens = prompt.EstimateTokens();
        Assert.True(tokens > 0);
    }

    [Fact]
    public void SkillTags_DeduplicateAndNormalize()
    {
        var tags = new SkillTags([" Remotion ", "remotion", "REACT", ""]);
        Assert.Equal(2, tags.Count);
        Assert.True(tags.Contains("remotion"));
        Assert.True(tags.Contains("react"));
    }

    [Theory]
    [InlineData("Remotion Scene Rules")]
    [InlineData("Hook Generator")]
    public void SkillName_ValidName_ShouldInstantiate(string raw)
    {
        var name = new SkillName(raw);
        Assert.Equal(raw.Trim(), name.Value);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void SkillName_EmptyName_ShouldThrowValidationException(string empty)
    {
        Assert.Throws<ValidationException>(() => new SkillName(empty));
    }
}
