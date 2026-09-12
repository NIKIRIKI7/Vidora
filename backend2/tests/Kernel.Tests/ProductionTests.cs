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
using ProductionContext.Domain.ScenarioEngine;
using ProductionContext.Domain.Services;
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
    public void ScenarioAstParser_DocumentedFormat_ShouldExtractScenesAndFragments()
    {
        var parser = new ScenarioAstParser();
        var md = """
        ---
        title: "Тест"
        tags: [тест, видео]
        ---

        [Хук] (00:00:00)
        *(Экран: быстрые кадры игр в 4K)* Первый фрагмент текста хука.
        *(Крупный план: чип, подсветка)* Второй фрагмент с <#0.5#> паузой.

        [Решение] (00:00:05)
        *(B-roll: assets/b-roll/clip.mp4)* Начинаем разбор.
        """;

        var scenes = parser.ParseMarkdown(new ProjectId("proj-123"), md);

        Assert.Equal(2, scenes.Count);
        Assert.Equal("Хук", scenes[0].Title);
        Assert.Equal("Решение", scenes[1].Title);

        Assert.Equal(2, scenes[0].Fragments.Count);
        Assert.Equal("Экран: быстрые кадры игр в 4K", scenes[0].Fragments[0].VisualNote);
        Assert.Equal("Первый фрагмент текста хука.", scenes[0].Fragments[0].Text);

        Assert.Equal("Второй фрагмент с <#0.5#> паузой.", scenes[0].Fragments[1].Text);
        Assert.Equal("B-roll: assets/b-roll/clip.mp4", scenes[1].Fragments[0].VisualNote);
    }

    [Fact]
    public void ScenarioAstParser_RemarkTimecode_ShouldFillDeclaredTiming()
    {
        var parser = new ScenarioAstParser();
        var md = """
        [Сцена с таймкодом] (00:00:00)
        *(00:05 - 00:12: Крупный план рук)* Текст, синхронизированный с этим отрезком.
        """;

        var scenes = parser.ParseMarkdown(new ProjectId("proj-123"), md);

        var fragment = Assert.Single(scenes).Fragments[0];
        Assert.Equal("Крупный план рук", fragment.VisualNote);
        Assert.True(fragment.HasDeclaredTiming);
        Assert.Equal(5.0, fragment.DeclaredStartSeconds);
        Assert.Equal(12.0, fragment.DeclaredEndSeconds);
    }

    [Fact]
    public void ScenarioAstParser_PureBrollLine_ShouldCreateFragmentWithoutSpeech()
    {
        var parser = new ScenarioAstParser();
        var md = """
        [Перебивка] (00:00:00)
        *(10-секундный таймлапс заката)*
        """;

        var scenes = parser.ParseMarkdown(new ProjectId("proj-123"), md);

        var fragment = Assert.Single(scenes).Fragments[0];
        Assert.Equal("10-секундный таймлапс заката", fragment.VisualNote);
        Assert.Equal(string.Empty, fragment.Text);
    }

    [Fact]
    public void SceneFragment_ContentHash_ShouldChangeWhenContentUpdates()
    {
        var project = Project.Create(ProjectId.New(), "Hash Test");
        var scene = project.AddScene("s1", "Scene", "");
        var frag = scene.AddFragment("Original text", "Visual A");

        var firstHash = frag.ContentHash;
        Assert.False(string.IsNullOrWhiteSpace(firstHash));

        frag.UpdateContent("Rewritten text", "Visual B");
        Assert.NotEqual(firstHash, frag.ContentHash);
        Assert.Equal("Rewritten text", frag.Text);
    }

    [Fact]
    public void SceneFragment_EstimateDuration_ShouldAccountForWordsAndPauses()
    {
        var project = Project.Create(ProjectId.New(), "Timing Test");
        var scene = project.AddScene("s1", "Scene", "");
        var frag = scene.AddFragment("Слово раз два три <#0.5#> финал", "Visual");

        var duration = frag.EstimateDuration();
        Assert.Equal(2.5, duration, precision: 2); // 5 слов / 2.5 = 2.0s + 0.5s паузы
    }

    [Fact]
    public void ScenarioLinter_ShouldFlagSlowPacingAndLongPause()
    {
        var project = Project.Create(ProjectId.New(), "Lint Me");
        var scene = project.AddScene("s1", "Хук", "");
        scene.AddFragment("Держим этот кадр очень долго, потому что текст рассчитан на длинное удержание внимания зрителя", "Статичный план");
        scene.AddFragment("Короткая реплика", "Другая ремарка");

        project.RecalculateTimeline();

        var linter = new ScenarioLinter();
        var issues = linter.LintProject(project);

        Assert.Contains(issues, i => i.Code == "PACING_VIOLATION");
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
    public void ScenarioAstParser_ShouldExtractFrontmatterMediaAnimationAndSfx()
    {
        var parser = new ScenarioAstParser();
        var md = """
        ---
        title: "Вирусный ролик"
        fps: 60
        primary: "#ddb7ff"
        ---

        [Хук] (00:00:00)
        *(появляется логотип из лотти, Anim: lottie/like.json)* [SFX: pop.mp3] Подписывайтесь на канал!
        *(B-roll: assets/b-roll/clip.mp4)* Текст с кадром.

        [Разбор] (00:00:05)
        [Transition: slide_left]
        *(Схема: график растёт)* Вот и разбор.
        """;

        var ast = parser.ParseToAst(md);

        Assert.Equal("Вирусный ролик", ast.Frontmatter.Title);
        Assert.Equal(60, ast.Frontmatter.Fps);
        Assert.True(ast.Frontmatter.Colors.ContainsKey("primary"));

        Assert.Equal(2, ast.Scenes.Count);

        var hook = ast.Scenes[0].Nodes.OfType<AstFragment>().ToList();
        Assert.Equal(2, hook.Count);

        Assert.Equal("lottie/like.json", hook[0].AnimationAssetLink);
        Assert.Equal("fade", hook[0].AnimationType); // эвристика по «появляется»
        Assert.Equal("pop.mp3", Assert.Single(hook[0].SfxList));
        Assert.DoesNotContain("[SFX:", hook[0].SpokenText);

        Assert.Equal("assets/b-roll/clip.mp4", hook[1].MediaLink);
        Assert.Equal("Текст с кадром.", hook[1].SpokenText);

        var разбор = ast.Scenes[1];
        Assert.NotNull(Assert.Single(разбор.Nodes.OfType<AstTransition>()));
    }

    [Fact]
    public void ScenarioAstParser_SerializeRoundTrip_ShouldKeepScenesAndFragments()
    {
        var parser = new ScenarioAstParser();
        var md = """
        ---
        title: "Round Trip"
        fps: 30
        ---

        [Интро] (00:00:00)
        *(Экран: текст выезжает слева)* Привет! Сегодня разберём тему.

        [Вывод] (00:00:12)
        *(Крупный план: финал)* Ставьте лайк и подписывайтесь.
        """;

        var ast = parser.ParseToAst(md);
        var serialized = parser.SerializeAstToMarkdown(ast);
        var reparsed = parser.ParseToAst(serialized);

        Assert.Equal(ast.Scenes.Count, reparsed.Scenes.Count);
        Assert.Equal("Интро", reparsed.Scenes[0].Title);
        Assert.Equal("Привет! Сегодня разберём тему.", reparsed.Scenes[0].Nodes.OfType<AstFragment>().Single().SpokenText);
        Assert.Equal(2, reparsed.Scenes.Sum(s => s.Nodes.OfType<AstFragment>().Count()));
        Assert.Equal("Round Trip", reparsed.Frontmatter.Title);
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
            .Returns<IReadOnlyList<StitchVideoItem>, string, CancellationToken>((items, outputPath, ct) =>
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
