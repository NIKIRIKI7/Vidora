using Kernel.Exceptions;
using Kernel.Platform.WebSockets;
using Kernel.Ports;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Research.Application.Pipelines;
using Research.Application.Services;
using Research.Contracts;
using Research.Domain;
using Research.Domain.Entities;
using Research.Domain.Ports;
using Research.Domain.Services;
using Research.Domain.ValueObjects;
using Research.Infrastructure.Ingestors;
using Research.Infrastructure.Export;
using Research.Infrastructure.Persistence;
using Skills.Contracts;
using Skills.Domain;
using Xunit;

namespace Kernel.Tests;

public class ResearchTests
{
    [Fact]
    public void MomentumEngine_HighVphAndOutlier_ShouldBeClassifiedAsOutlier()
    {
        var engine = new MomentumEngine();
        var now = DateTimeOffset.UtcNow;
        var publishedAt = now.AddHours(-10);

        var momentum = engine.CalculateMomentum(100_000, publishedAt, 10_000, now);

        Assert.True(momentum.ViewsPerHour >= 9000);
        Assert.True(momentum.OutlierMultiplier >= 2.5);
        Assert.True(engine.IsVelocityOutlier(momentum));
        Assert.True(momentum.Score >= 80.0);
    }

    [Fact]
    public void BlueOceanDetector_SaturatedNiche_ShouldFlagAsRedOcean()
    {
        var detector = new BlueOceanDetector();
        var eval = detector.EvaluateTopicCompetition("Python AI Automation", 50, dominantChannelsCount: 6, aggregateVph: 12000);

        Assert.False(eval.IsBlueOcean);
        Assert.Contains("Красный океан", eval.AnalysisSummary);
    }

    [Fact]
    public void ConfusionDetector_ShouldExtractKeyCognitiveTriggers()
    {
        var detector = new ConfusionDetector();
        var comments = new[]
        {
            "Почему никто не говорит о том, что этот метод сжигает бюджет?",
            "Как на самом деле правильно настроить FFmpeg без артефактов?",
            "Обычный комментарий без вопроса"
        };

        var friction = detector.DetectFrictionPoints(comments);
        Assert.Equal(3, friction.Count);
        Assert.Contains(friction, f => f.Category == "InformationVacuum");
        Assert.Contains(friction, f => f.Category == "PracticalExecution");
        Assert.Contains(friction, f => f.Category == "UnderlyingMechanism");
    }

    [Fact]
    public void CommentGoldmineExtractor_ShouldClusterPainPoints()
    {
        var extractor = new CommentGoldmineExtractor();
        var comments = new[]
        {
            "У меня постоянная ошибка в коде при импорте",
            "Какая главная ошибка новичков при сборке сцен?",
            "Как на самом деле начать программировать?",
            "Почему у меня ничего не запускается?"
        };

        var mined = extractor.ExtractTopPainPoints(comments);
        Assert.NotEmpty(mined);
        Assert.Contains(mined, m => m.TopicSummary.Contains("ошибки"));
    }

    [Fact]
    public async Task EfResearchRunRepository_ShouldPersistAggregateHierarchy()
    {
        var options = new DbContextOptionsBuilder<ResearchDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        await using var db = new ResearchDbContext(options);
        await db.Database.OpenConnectionAsync();
        await db.Database.EnsureCreatedAsync();

        var repo = new EfResearchRunRepository(db);
        var run = ResearchRun.StartNew(ResearchRunId.New(), "Neural NeRF Video Synthesis", "Tech");

        var candidate = VideoCandidate.Create(
            run.Id, "video-01", "NeRF Tutorial", "TechChannel", "UC123",
            10000, 50000, DateTimeOffset.UtcNow.AddDays(-2), 300, new MomentumScore(1000, 3.2));

        var signal = EarlySignal.Create(run.Id, "3D Gaussian Splatting Breakthrough", ["nerf", "gaussian"], 85.0, 3, 4500, 0.9);
        var opportunity = Opportunity.Create(run.Id, "Why NeRF is Dead", "Hook", "Developers", "Shorts 60s", OpportunityScore.Create(95, 0.8, 0.9), "Friction", "Why");

        run.AddCandidates([candidate]);
        run.AddSignals([signal]);
        run.AddOpportunities([opportunity]);
        run.MarkCompleted();

        await repo.AddAsync(run);
        await repo.SaveChangesAsync();

        var retrieved = await repo.GetByIdAsync(run.Id);
        Assert.NotNull(retrieved);
        Assert.Equal("Neural NeRF Video Synthesis", retrieved.TopicQuery);
        Assert.Single(retrieved.Candidates);
        Assert.Single(retrieved.Signals);
        Assert.Single(retrieved.Opportunities);
        Assert.Equal(ResearchStatus.Completed, retrieved.Status);
    }

    [Fact]
    public async Task OpenXmlResearchReportExporter_ShouldProduceValidZipArchive()
    {
        var exporter = new OpenXmlResearchReportExporter();
        var run = ResearchRun.StartNew(ResearchRunId.New(), "Excel Export Test");
        run.AddOpportunities([
            Opportunity.Create(run.Id, "Title", "Hook", "Audience", "Format", OpportunityScore.Create(80, 0.7, 0.8), "Friction", "Why")
        ]);

        var bytes = await exporter.ExportToExcelAsync(run);
        Assert.NotNull(bytes);
        Assert.True(bytes.Length > 0);

        using var ms = new MemoryStream(bytes);
        using var zip = new System.IO.Compression.ZipArchive(ms, System.IO.Compression.ZipArchiveMode.Read);
        Assert.NotNull(zip.GetEntry("xl/workbook.xml"));
        Assert.NotNull(zip.GetEntry("xl/worksheets/sheet1.xml"));
        Assert.NotNull(zip.GetEntry("[Content_Types].xml"));
    }

    [Fact]
    public async Task DeepTrendDagPipeline_ShouldStreamProgressAndCompleteRun()
    {
        var ingestor = new Mock<IYouTubeSearchIngestor>();
        ingestor.Setup(i => i.SearchTopicCandidatesAsync(It.IsAny<string>(), It.IsAny<int>(), It.IsAny<int>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new List<RawVideoSearchResult>
            {
                new("vid-1", "Video 1", "Channel", "UC1", 50000, 200000, DateTimeOffset.UtcNow.AddDays(-1), 180, "thumb.jpg", new[] { "Почему никто не делает так?" })
            });

        var skills = new Mock<ISkillsCatalog>();
        skills.Setup(s => s.GetSkillBundleForStageAsync(SkillStage.TrendResearch, It.IsAny<int?>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new SkillBundleDto { Stage = SkillStage.TrendResearch, SystemPrompt = "Rules" });

        var llm = new Mock<ILlmClient>();
        llm.Setup(l => l.GenerateTextAsync(It.IsAny<LlmPromptSpec>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("""[{"angle_title":"Test Angle","hook_hypothesis":"Test Hook","target_audience":"Techies","recommended_format":"Shorts 60s","friction_point":"Conf","why_it_works":"Why"}]""");

        var pipeline = new DeepTrendDagPipeline(
            ingestor.Object,
            new Mock<ISignalIngestor>().Object,
            new MomentumEngine(),
            new BlueOceanDetector(),
            new ConfusionDetector(),
            new CommentGoldmineExtractor(),
            skills.Object,
            llm.Object,
            NullLogger<DeepTrendDagPipeline>.Instance);

        var run = ResearchRun.StartNew(ResearchRunId.New(), "Automated Content Production");
        var steps = new List<ResearchDagProgressDto>();

        await foreach (var step in pipeline.RunAsync(run))
        {
            steps.Add(step);
        }

        Assert.NotEmpty(steps);
        Assert.Equal(ResearchStatus.Completed, run.Status);
        Assert.Single(run.Opportunities);
    }
}
