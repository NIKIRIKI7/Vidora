using Kernel.Events;
using Kernel.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Skills.Application.Services;
using Skills.Domain;
using Skills.Domain.Entities;
using Skills.Domain.Events;
using Skills.Domain.Services;
using Skills.Infrastructure.Persistence;
using Skills.Infrastructure.Seeding;
using Xunit;

namespace Kernel.Tests;

public class SkillsTests
{
    [Fact]
    public void Skill_Create_WithInvalidData_ShouldThrowValidationException()
    {
        // Невалидный ID (содержит пробелы и спецсимволы)
        Assert.Throws<ValidationException>(() =>
            Skill.Create("invalid id!", "Name", "Desc", SkillStage.SceneGeneration, "Content"));

        // Пустое имя
        Assert.Throws<ValidationException>(() =>
            Skill.Create("valid-id", "", "Desc", SkillStage.SceneGeneration, "Content"));

        // Пустой контент
        Assert.Throws<ValidationException>(() =>
            Skill.Create("valid-id", "Name", "Desc", SkillStage.SceneGeneration, "  "));

        // Приоритет вне диапазона 0..1000
        Assert.Throws<ValidationException>(() =>
            Skill.Create("valid-id", "Name", "Desc", SkillStage.SceneGeneration, "Content", priority: 1500));
    }

    [Fact]
    public void Skill_Update_ShouldIncrementVersion_WhenContentChanges()
    {
        var skill = Skill.Create("skill-1", "Original Name", "Desc", SkillStage.SceneGeneration, "Initial Content");
        Assert.Equal(1, skill.Version.Value);

        skill.Update("Original Name", "Desc", "New Modified Content", 100, true);

        Assert.Equal(2, skill.Version.Value);
        Assert.Equal("New Modified Content", skill.Content.Value);
    }

    [Fact]
    public void Skill_ResetToDefault_ShouldRestoreOriginalContent()
    {
        var skill = Skill.Create(
            id: "default-skill",
            name: "Default Template",
            description: "Desc",
            stage: SkillStage.SceneGeneration,
            content: "Default Text",
            isDefault: true);

        // Пользователь переопределил контент
        skill.Update("Default Template", "Desc", "Custom User Text", 100, true);
        Assert.Equal("Custom User Text", skill.Content.Value);
        Assert.Equal(2, skill.Version.Value);

        // Сброс к дефолту
        skill.ResetToDefault();
        Assert.Equal("Default Text", skill.Content.Value);
        Assert.Equal(3, skill.Version.Value);
    }

    [Fact]
    public void Skill_ResetCustomSkill_ShouldThrowDomainConflict()
    {
        var customSkill = Skill.Create(
            id: "custom-skill",
            name: "Custom",
            description: "Desc",
            stage: SkillStage.SceneGeneration,
            content: "Custom Text",
            isDefault: false);

        Assert.Throws<DomainConflictException>(() => customSkill.ResetToDefault());
    }

    [Fact]
    public void Skill_DeleteDefault_ShouldThrowDomainConflict()
    {
        var defaultSkill = Skill.Create(
            id: "system-skill",
            name: "System",
            description: "Desc",
            stage: SkillStage.SceneGeneration,
            content: "System Text",
            isDefault: true);

        Assert.Throws<DomainConflictException>(() => defaultSkill.AssertCanDelete());
    }

    [Fact]
    public void PromptBuilder_ShouldRespectBudgetAndOrderSkillsByPriority()
    {
        var builder = new PromptBuilder();

        var highPrioritySkill = Skill.Create("s-1", "High Priority", "Desc", SkillStage.SceneGeneration, "High Priority Rule", priority: 500);
        var lowPrioritySkill = Skill.Create("s-2", "Low Priority", "Desc", SkillStage.SceneGeneration, "Low Priority Rule", priority: 50);
        var disabledSkill = Skill.Create("s-3", "Disabled", "Desc", SkillStage.SceneGeneration, "Disabled Rule", priority: 999);
        disabledSkill.Disable();

        var result = builder.BuildBundle([lowPrioritySkill, highPrioritySkill, disabledSkill], tokenLimit: 1000);

        Assert.Contains("High Priority", result.ComposedPrompt);
        Assert.Contains("Low Priority", result.ComposedPrompt);
        Assert.DoesNotContain("Disabled Rule", result.ComposedPrompt);

        // High priority должен идти перед Low priority в скомпонованном тексте
        int highIndex = result.ComposedPrompt.IndexOf("High Priority", StringComparison.Ordinal);
        int lowIndex = result.ComposedPrompt.IndexOf("Low Priority", StringComparison.Ordinal);
        Assert.True(highIndex < lowIndex);
    }

    [Fact]
    public void PromptBuilder_ShouldOmitSkills_WhenBudgetIsExceeded()
    {
        var builder = new PromptBuilder();

        // Создаем скил с длинным текстом
        var largeContent = new string('A', 8000); // ~2000 токенов
        var largeSkill = Skill.Create("s-large", "Large Skill", "Desc", SkillStage.SceneGeneration, largeContent, priority: 200);
        var smallSkill = Skill.Create("s-small", "Small Skill", "Desc", SkillStage.SceneGeneration, "Small Content", priority: 100);

        // Ограничиваем бюджет до 500 токенов: большой скил не влезет, маленький должен влезть
        var result = builder.BuildBundle([largeSkill, smallSkill], tokenLimit: 500);

        Assert.Single(result.IncludedSkills);
        Assert.Equal("s-small", result.IncludedSkills[0].Id);
        Assert.Single(result.OmittedSkills);
        Assert.Equal("s-large", result.OmittedSkills[0].Id);
    }

    [Fact]
    public async Task SkillsCatalog_EndToEnd_ShouldWorkWithInMemorySqlite()
    {
        var options = new DbContextOptionsBuilder<SkillsDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        await using var dbContext = new SkillsDbContext(options);
        await dbContext.Database.OpenConnectionAsync();
        await dbContext.Database.EnsureCreatedAsync();

        var repo = new EfSkillRepository(dbContext);
        var promptBuilder = new PromptBuilder();
        var catalog = new SkillsCatalog(repo, promptBuilder);

        var skill = Skill.Create("skill-remotion", "Remotion Core", "Desc", SkillStage.SceneGeneration, "Use Spring physics", priority: 100);
        await repo.AddAsync(skill);
        await repo.SaveChangesAsync();

        var bundle = await catalog.GetSkillBundleForStageAsync(SkillStage.SceneGeneration);

        Assert.Equal(SkillStage.SceneGeneration, bundle.Stage);
        Assert.Single(bundle.IncludedSkills);
        Assert.Contains("Use Spring physics", bundle.SystemPrompt);
        Assert.True(bundle.TotalEstimatedTokens > 0);
    }

    [Fact]
    public async Task SkillsDbContext_Stage_ShouldBeStoredAsSnakeCaseInSqlite()
    {
        var options = new DbContextOptionsBuilder<SkillsDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        using var dbContext = new SkillsDbContext(options);
        await dbContext.Database.OpenConnectionAsync();
        await dbContext.Database.EnsureCreatedAsync();

        var skill = Skill.Create("skill-snake-test", "Snake Test", "Desc", SkillStage.SceneGeneration, "Content");
        await dbContext.Skills.AddAsync(skill);
        await dbContext.SaveChangesAsync();

        // Проверяем прямое строковое значение в SQLite через сырой SQL
        using var cmd = dbContext.Database.GetDbConnection().CreateCommand();
        cmd.CommandText = "SELECT Stage FROM skills WHERE Id = 'skill-snake-test'";
        var rawDbValue = (string?)await cmd.ExecuteScalarAsync();

        Assert.Equal("scene_generation", rawDbValue);
    }

    [Fact]
    public async Task SkillsSeeder_ShouldDisableDefaultSkills_WhenRemovedFromSeed()
    {
        var options = new DbContextOptionsBuilder<SkillsDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        using var dbContext = new SkillsDbContext(options);
        await dbContext.Database.OpenConnectionAsync();
        await dbContext.Database.EnsureCreatedAsync();

        var repo = new EfSkillRepository(dbContext);
        var seeder = new SkillsSeeder(repo, NullLogger<SkillsSeeder>.Instance);

        // 1. Первый сид из временного файла с двумя дефолтными скилами
        var twoSeedJson = """
        [
          {
            "id": "skill-remotion-scene-default",
            "name": "Remotion TSX Scene Best Practices",
            "description": "Desc",
            "stage": "scene_generation",
            "content": "Original content",
            "priority": 100,
            "tags": ["remotion"]
          },
          {
            "id": "skill-hook-retention-analyzer",
            "name": "Hook Retention Analyzer",
            "description": "Desc",
            "stage": "hook_analysis",
            "content": "Original content",
            "priority": 100,
            "tags": ["hook"]
          }
        ]
        """;
        var twoSeedPath = Path.Combine(Path.GetTempPath(), $"skills_seed_{Guid.NewGuid():N}.json");
        await File.WriteAllTextAsync(twoSeedPath, twoSeedJson);

        var singleSeedJson = """
        [
          {
            "id": "skill-remotion-scene-default",
            "name": "Remotion TSX Scene Best Practices",
            "description": "Desc",
            "stage": "scene_generation",
            "content": "Updated content",
            "priority": 100,
            "tags": ["remotion"]
          }
        ]
        """;
        var singleSeedPath = Path.Combine(Path.GetTempPath(), $"skills_seed_{Guid.NewGuid():N}.json");
        await File.WriteAllTextAsync(singleSeedPath, singleSeedJson);

        try
        {
            await seeder.SeedAsync(twoSeedPath, CancellationToken.None);

            var initialSkills = await repo.GetAllAsync();
            Assert.Equal(2, initialSkills.Count);
            Assert.All(initialSkills, s => Assert.True(s.IsEnabled));

            // 2. Повторный запуск сидера с урезанным файлом (второй скил удален)
            await seeder.SeedAsync(singleSeedPath, CancellationToken.None);

            var remainingSkill = await repo.GetByIdAsync("skill-remotion-scene-default");
            var removedSkill = await repo.GetByIdAsync("skill-hook-retention-analyzer");

            Assert.NotNull(remainingSkill);
            Assert.True(remainingSkill.IsEnabled);

            Assert.NotNull(removedSkill);
            // Удаленный из сида дефолтный скил должен быть выключен (IsEnabled = false)
            Assert.False(removedSkill.IsEnabled);
        }
        finally
        {
            if (File.Exists(twoSeedPath)) File.Delete(twoSeedPath);
            if (File.Exists(singleSeedPath)) File.Delete(singleSeedPath);
        }
    }

    [Theory]
    [InlineData("""{"name": "Skill", "content": "Rule", "is_enabled": false}""", false)]
    [InlineData("""{"name": "Skill", "content": "Rule", "isEnabled": false}""", false)]
    [InlineData("""{"name": "Skill", "content": "Rule"}""", true)]
    public void UpdateSkillRequest_ShouldBindBothSnakeCaseAndCamelCase(string json, bool expectedEnabled)
    {
        var request = System.Text.Json.JsonSerializer.Deserialize<Api.Endpoints.Skills.UpdateSkillRequest>(json);
        Assert.NotNull(request);
        Assert.Equal(expectedEnabled, request.IsEnabled);
    }

    [Fact]
    public async Task DatabaseMigration_ShouldNormalizeLegacyPascalCaseStagesAutomatically()
    {
        var options = new DbContextOptionsBuilder<SkillsDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        using var dbContext = new SkillsDbContext(options);
        var connection = dbContext.Database.GetDbConnection();
        await dbContext.Database.OpenConnectionAsync();

        // 1. Имитируем старую схему базы, созданную до введения миграций
        using (var setupCmd = connection.CreateCommand())
        {
            setupCmd.CommandText = """
                CREATE TABLE skills (
                    Id TEXT PRIMARY KEY,
                    Name TEXT NOT NULL,
                    Description TEXT,
                    Stage TEXT NOT NULL,
                    Content TEXT NOT NULL,
                    DefaultContent TEXT,
                    Priority INTEGER NOT NULL,
                    Version INTEGER NOT NULL,
                    IsDefault INTEGER NOT NULL,
                    IsEnabled INTEGER NOT NULL,
                    Tags TEXT NOT NULL,
                    CreatedAt TEXT NOT NULL,
                    UpdatedAt TEXT NOT NULL
                );

                -- Вставляем запись со старым значением Stage = 'SceneGeneration' (PascalCase)
                INSERT INTO skills (Id, Name, Description, Stage, Content, Priority, Version, IsDefault, IsEnabled, Tags, CreatedAt, UpdatedAt)
                VALUES ('legacy-skill', 'Legacy', 'Desc', 'SceneGeneration', 'Rules', 100, 1, 1, 1, '[]', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z');
            """;
            await setupCmd.ExecuteNonQueryAsync();
        }

        var hostedService = new SkillsSeederHostedService(
            serviceProvider: null!,
            logger: NullLogger<SkillsSeederHostedService>.Instance);

        // 2. Запускаем процедуру миграции и нормализации
        await hostedService.MigrateAndNormalizeDatabaseAsync(dbContext, CancellationToken.None);

        // 3. Проверяем, что в SQLite значение Stage превратилось в 'scene_generation'
        using (var verifyCmd = connection.CreateCommand())
        {
            verifyCmd.CommandText = "SELECT Stage FROM skills WHERE Id = 'legacy-skill'";
            var stageInDb = (string?)await verifyCmd.ExecuteScalarAsync();
            Assert.Equal("scene_generation", stageInDb);
        }

        // 4. Проверяем, что EF Core репозиторий теперь находит этот скил по enum
        var repo = new EfSkillRepository(dbContext);
        var skills = await repo.GetByStageAsync(SkillStage.SceneGeneration);
        Assert.Single(skills);
        Assert.Equal("legacy-skill", skills[0].Id);
        Assert.Equal(SkillStage.SceneGeneration, skills[0].Stage);
    }

    [Fact]
    public async Task Skill_CreatingAndSaving_ShouldAutoDispatchDomainEventThroughBaseDbContext()
    {
        var options = new DbContextOptionsBuilder<SkillsDbContext>()
            .UseSqlite("Data Source=:memory:")
            .Options;

        var eventBus = new InMemoryEventBus(NullLogger<InMemoryEventBus>.Instance);
        await using var dbContext = new SkillsDbContext(options, eventBus);
        await dbContext.Database.OpenConnectionAsync();
        await dbContext.Database.EnsureCreatedAsync();

        var skill = Skill.CreateCustom(
            id: "event-test-skill",
            name: "Test Skill",
            description: "Test Desc",
            stage: SkillStage.SceneGeneration,
            content: "Test Content");

        Assert.Single(skill.DomainEvents);

        await dbContext.Skills.AddAsync(skill);
        await dbContext.SaveChangesAsync();

        // После SaveChangesAsync события собраны и очищены из сущности
        Assert.Empty(skill.DomainEvents);
    }

    [Fact]
    public void Skill_CreateDefault_ShouldNotEmitDomainEventsDuringSeeding()
    {
        var skill = Skill.CreateDefault(
            id: "default-seed-skill",
            name: "Seed Skill",
            description: "Seed Desc",
            stage: SkillStage.SceneGeneration,
            content: "Rule Content");

        // При сидинге событий быть не должно
        Assert.Empty(skill.DomainEvents);
    }

    [Fact]
    public void Skill_CreateCustom_ShouldEmitDomainEvent()
    {
        var skill = Skill.CreateCustom(
            id: "custom-user-skill",
            name: "User Skill",
            description: "User Desc",
            stage: SkillStage.SceneGeneration,
            content: "Rule Content");

        Assert.Single(skill.DomainEvents);
        var domainEvent = Assert.IsType<SkillCreatedEvent>(skill.DomainEvents[0]);
        Assert.Equal("custom-user-skill", domainEvent.AggregateId);
    }
}
