using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Ports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using MotionContext.Application.Services;
using MotionContext.Contracts;
using MotionContext.Domain;
using MotionContext.Domain.Entities;
using MotionContext.Domain.Ports;
using MotionContext.Domain.ValueObjects;
using MotionContext.Infrastructure.Capabilities;
using MotionContext.Infrastructure.Parsing;
using MotionContext.Infrastructure.Persistence;
using Skills.Contracts;
using Skills.Domain;
using Xunit;

namespace Kernel.Tests;

public class MotionRefactoredTests
{
    [Fact]
    public void LlmCodeExtractor_ShouldStripMarkdownFences_AndSanitizeCode()
    {
        var registry = new PackageCapabilityRegistry(NullLogger<PackageCapabilityRegistry>.Instance);
        var sanitizer = new TsxSanitizer(registry, NullLogger<TsxSanitizer>.Instance);
        var extractor = new LlmCodeExtractor(sanitizer);

        var llmOutput = """
            ```tsx
            import React from 'react';
            export default function Scene() { return <div>Test</div>; }
            ```
            """;

        var result = extractor.ExtractAndSanitize(llmOutput);

        Assert.NotNull(result.SanitizedCode);
        Assert.DoesNotContain("```", result.SanitizedCode.Value);
        Assert.Contains("export default function Scene", result.SanitizedCode.Value);
    }

    [Fact]
    public void MontageTheme_FromDto_ShouldMapColorsCorrectly()
    {
        var dto = new MontageSettingsDto
        {
            Colors = new AppColorsDto
            {
                Primary = "#111111",
                Secondary = "#222222",
                Background = "#333333",
                Surface = "#444444",
                Accent = "#555555",
                Text = "#666666"
            },
            Typography = "Roboto",
            AnimationStyle = "bouncy"
        };

        var theme = MontageTheme.FromDto(dto);

        Assert.Equal("#111111", theme.Primary);
        Assert.Equal("#222222", theme.Secondary);
        Assert.Equal("#333333", theme.Background);
        Assert.Equal("#444444", theme.Surface);
        Assert.Equal("#555555", theme.Accent);
        Assert.Equal("#666666", theme.Text);
        Assert.Equal("Roboto", theme.Typography);
        Assert.Equal("bouncy", theme.AnimationStyle);
    }

    [Fact]
    public void MontageTheme_FromDto_Null_ShouldReturnDefault()
    {
        var theme = MontageTheme.FromDto(null);

        Assert.Equal(MontageTheme.Default.Primary, theme.Primary);
        Assert.Equal(MontageTheme.Default.Typography, theme.Typography);
    }
}
