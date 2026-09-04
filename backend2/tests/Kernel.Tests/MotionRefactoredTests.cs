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
using MotionContext.Infrastructure.Remotion;
using MotionContext.Infrastructure.Workers;
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
    public void RemotionTemplateRenderer_ShouldGenerateExpectedRootAndStyles()
    {
        var renderer = new RemotionTemplateRenderer();
        var composition = CompositionConfig.FullHdVertical(3.0, 30);
        var theme = new MontageTheme { Primary = "#ff0000", Accent = "#00ff00" };

        var rootTsx = renderer.RenderRootTsx(composition, new { test = "ok" });
        var stylesCss = renderer.RenderStylesCss(theme);

        Assert.Contains("width={1080}", rootTsx);
        Assert.Contains("height={1920}", rootTsx);
        Assert.Contains("durationInFrames={90}", rootTsx);
        Assert.Contains("--color-primary: #ff0000", stylesCss);
        Assert.Contains("--color-accent: #00ff00", stylesCss);
    }

    [Fact]
    public async Task RenderJobQueue_ShouldEnqueueAndDequeueAsync()
    {
        var queue = new ChannelRenderJobQueue();
        var jobId = RenderJobId.New();

        await queue.EnqueueAsync(jobId);

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        var dequeued = new List<RenderJobId>();

        await foreach (var item in queue.DequeueAllAsync(cts.Token))
        {
            dequeued.Add(item);
            break;
        }

        Assert.Single(dequeued);
        Assert.Equal(jobId, dequeued[0]);
    }

    [Fact]
    public async Task MotionModule_StartRenderAsync_ShouldEnqueueJobToChannelQueue()
    {
        var options = new DbContextOptionsBuilder<MotionDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        await using var db = new MotionDbContext(options);
        await db.Database.OpenConnectionAsync();
        await db.Database.EnsureCreatedAsync();

        var sceneRepo = new EfSceneCodeRepository(db, NullLogger<EfSceneCodeRepository>.Instance);
        var jobRepo = new EfRenderJobRepository(db, NullLogger<EfRenderJobRepository>.Instance);
        var renderQueueMock = new Mock<IRenderJobQueue>();
        var renderTrackerMock = new Mock<IRenderTracker>();
        var promptComposerMock = new Mock<IScenePromptComposer>();
        var extractorMock = new Mock<ILlmCodeExtractor>();
        var llmClientMock = new Mock<ILlmClient>();
        var registry = new PackageCapabilityRegistry(NullLogger<PackageCapabilityRegistry>.Instance);

        var scene = SceneCode.Create(
            SceneCodeId.New(),
            "p1",
            "s1",
            CompositionConfig.FullHdVertical(2.0, 30),
            new TsxCode("export default function Scene() { return null; }"));

        await sceneRepo.AddAsync(scene);
        await sceneRepo.SaveChangesAsync();

        var module = new MotionModule(
            sceneRepo,
            jobRepo,
            renderQueueMock.Object,
            renderTrackerMock.Object,
            promptComposerMock.Object,
            extractorMock.Object,
            llmClientMock.Object,
            registry,
            NullLogger<MotionModule>.Instance);

        var renderJob = await module.StartRenderAsync(scene.Id.Value, new StartRenderRequest(null, null));

        Assert.NotNull(renderJob);
        Assert.Equal(RenderJobStatus.Queued, renderJob.Status);

        renderQueueMock.Verify(q => q.EnqueueAsync(It.Is<RenderJobId>(id => id.Value == renderJob.Id), It.IsAny<CancellationToken>()), Times.Once);
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
