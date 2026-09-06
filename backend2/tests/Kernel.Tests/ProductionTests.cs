using Kernel.Contracts;
using Kernel.Exceptions;
using Kernel.Platform.Config;
using Kernel.Platform.FileSystem;
using Kernel.Platform.WebSockets;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Moq;
using ProductionContext.Application.Services;
using ProductionContext.Contracts;
using ProductionContext.Domain;
using ProductionContext.Domain.Entities;
using ProductionContext.Domain.Ports;
using ProductionContext.Domain.ValueObjects;
using ProductionContext.Infrastructure.Parsing;
using ProductionContext.Infrastructure.Persistence;
using Xunit;

namespace Kernel.Tests;

public class ProductionTests
{
    [Fact]
    public void Project_Create_ValidParameters_ShouldInitializeCorrectly()
    {
        var id = ProjectId.New();
        var project = Project.Create(id, "Test Viral Video", new MontageSettingsDto { Fps = 30 });

        Assert.Equal("Test Viral Video", project.Title);
        Assert.Equal(ProjectStatus.Draft, project.Status);
        Assert.Equal(PipelineStep.Drafting, project.CurrentStep);
        Assert.Single(project.DomainEvents);
        Assert.Contains(id.Value, project.RelativePath);
    }

    [Fact]
    public void Project_AddDuplicateScene_ShouldThrowDomainConflictException()
    {
        var project = Project.Create(ProjectId.New(), "Unique Scenes Only");
        project.AddScene("scene-1", "Intro", "Opening visual");

        Assert.Throws<DomainConflictException>(() =>
            project.AddScene("scene-1", "Duplicate Intro", "Visual"));
    }

    [Fact]
    public void MarkdownScenarioParser_ValidMarkdown_ShouldExtractScenesAndFragments()
    {
        var parser = new MarkdownScenarioParser();
        var md = """
        # My Epic Video

        ## Scene 1: The Hook
        [Visual: Fast neon zoom into neural chip]
        Narrator: Did you know AI can generate videos in seconds?

        ## Scene 2: The Solution
        [Visual: Code transforms into cinema canvas]
        Narrator: Welcome to the future of procedural motion design.
        """;

        var scenes = parser.ParseMarkdown(new ProjectId("proj-123"), md);

        Assert.Equal(2, scenes.Count);
        Assert.Equal("The Hook", scenes[0].Title);
        Assert.Single(scenes[0].Fragments);
        Assert.Equal("Did you know AI can generate videos in seconds?", scenes[0].Fragments[0].Text);
        Assert.Equal("The Solution", scenes[1].Title);
    }

    [Fact]
    public void Project_RecalculateTimeline_ShouldMaintainSequentialOffsets()
    {
        var project = Project.Create(ProjectId.New(), "Timeline Test");
        var s1 = project.AddScene("s1", "Scene 1", "Visual 1");
        s1.AddFragment("Short speech 1", "Note", durationSeconds: 2.5);

        var s2 = project.AddScene("s2", "Scene 2", "Visual 2");
        s2.AddFragment("Short speech 2", "Note", durationSeconds: 3.5);

        project.RecalculateTimeline();

        Assert.Equal(0.0, s1.StartSeconds);
        Assert.Equal(2.5, s1.EndSeconds);
        Assert.Equal(2.5, s2.StartSeconds);
        Assert.Equal(6.0, s2.EndSeconds);
        Assert.Equal(6.0, project.TotalDurationSeconds);
    }

    private static (ProductionDbContext db, ServiceProvider sp) CreateInMemoryDb()
    {
        var sp = new ServiceCollection()
            .AddEntityFrameworkSqlite()
            .BuildServiceProvider();

        var options = new DbContextOptionsBuilder<ProductionDbContext>()
            .UseSqlite("Data Source=:memory:")
            .UseInternalServiceProvider(sp)
            .Options;

        var db = new ProductionDbContext(options);
        return (db, sp);
    }

    [Fact]
    public async Task EfProjectRepository_InMemorySqlite_ShouldPersistAndRetrieveProjectHierarchy()
    {
        var (db, sp) = CreateInMemoryDb();
        await using var _ = db;
        await using var __ = sp;
        await db.Database.OpenConnectionAsync();
        await db.Database.EnsureCreatedAsync();

        var repo = new EfProjectRepository(db);
        var project = Project.Create(ProjectId.New(), "Persistent Project");
        var scene = project.AddScene("s1", "Scene 1", "Visual Note");
        scene.AddFragment("Spoken audio fragment", "Broll Note", 2.0);

        await repo.AddAsync(project);
        await repo.SaveChangesAsync();

        var retrieved = await repo.GetByIdAsync(project.Id);
        Assert.NotNull(retrieved);
        Assert.Equal("Persistent Project", retrieved.Title);
        Assert.Single(retrieved.Scenes);
        Assert.Single(retrieved.Scenes[0].Fragments);
        Assert.Equal("Spoken audio fragment", retrieved.Scenes[0].Fragments[0].Text);
    }

    [Fact]
    public async Task ProcessManager_ShouldExecuteAllStepsAndComplete()
    {
        var (db, sp) = CreateInMemoryDb();
        await using var _ = db;
        await using var __ = sp;
        await db.Database.OpenConnectionAsync();
        await db.Database.EnsureCreatedAsync();

        var repo = new EfProjectRepository(db);
        var voiceGateway = new Mock<IVoiceGateway>();
        var motionGateway = new Mock<IMotionGateway>();
        var mediaGateway = new Mock<IMediaGateway>();
        var videoStitcher = new Mock<IVideoStitcher>();
        var pathResolver = new Mock<IPathResolver>();
        var ws = new Mock<IWebSocketGateway>();

        var tempDir = Path.Combine(Path.GetTempPath(), "production_test_" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        pathResolver.Setup(p => p.ResolveSafePath(It.IsAny<string>(), It.IsAny<string?>()))
            .Returns<string, string?>((path, _) => Path.GetFullPath(path));

        voiceGateway.Setup(v => v.SynthesizeFragmentAudioAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<double>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new VoiceSynthesisResult("voice.wav", "asset-voice-1", 2.0));

        motionGateway.Setup(m => m.GenerateSceneCodeAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<double>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("sc-1");

        var dummySceneVideo = Path.Combine(tempDir, "scene_1.mp4");
        await File.WriteAllTextAsync(dummySceneVideo, "dummy-video-content");

        motionGateway.Setup(m => m.RenderSceneVideoAsync(It.IsAny<string>(), It.IsAny<IProgress<double>?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(dummySceneVideo);

        mediaGateway.Setup(m => m.RegisterVideoAssetAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("asset-video-1");

        var dummyMasterVideo = Path.Combine(tempDir, "master_output.mp4");
        await File.WriteAllTextAsync(dummyMasterVideo, "dummy-master-mp4");

        videoStitcher.Setup(v => v.ConcatenateScenesAsync(It.IsAny<IReadOnlyList<StitchVideoItem>>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns<string, string, CancellationToken>((items, outputPath, ct) =>
            {
                File.WriteAllText(outputPath, "dummy-stitched-video");
                return Task.FromResult(outputPath);
            });

        var orchestrator = new ProductionPipelineProcessManager(
            repo,
            voiceGateway.Object,
            motionGateway.Object,
            mediaGateway.Object,
            videoStitcher.Object,
            pathResolver.Object,
            ws.Object,
            Options.Create(new AppStorageConfig { DataStorageDir = tempDir }),
            NullLogger<ProductionPipelineProcessManager>.Instance);

        var project = Project.Create(ProjectId.New(), "Full Assembly");
        var scene = project.AddScene("sc-01", "Hook", "Visual");
        scene.AddFragment("Spoken text", "Vis", 2.0);

        await repo.AddAsync(project);
        await repo.SaveChangesAsync();

        await orchestrator.ExecuteAsync(project.Id, "alloy", null, false, CancellationToken.None);

        var finishedProject = await repo.GetByIdAsync(project.Id);
        Assert.NotNull(finishedProject);
        Assert.Equal(ProjectStatus.Ready, finishedProject.Status);
        Assert.Equal(PipelineStep.Completed, finishedProject.CurrentStep);
        Assert.NotNull(finishedProject.FinalVideoPath);
    }
}
