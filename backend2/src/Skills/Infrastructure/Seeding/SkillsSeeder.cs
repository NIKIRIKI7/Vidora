using System.Text.Json;
using Microsoft.Extensions.Logging;
using Skills.Domain;
using Skills.Domain.Entities;
using Skills.Domain.Ports;

namespace Skills.Infrastructure.Seeding;

public sealed class SkillsSeeder
{
    private readonly ISkillRepository _repository;
    private readonly ILogger<SkillsSeeder> _logger;

    public SkillsSeeder(ISkillRepository repository, ILogger<SkillsSeeder> logger)
    {
        _repository = repository;
        _logger = logger;
    }

    public async Task SeedAsync(string? customSeedPath = null, CancellationToken cancellationToken = default)
    {
        var seedItems = LoadSeedModels(customSeedPath);
        var validSeedItems = FilterValidSeedItems(seedItems);
        var currentSeedIds = validSeedItems.Select(x => x.Model.Id.Trim().ToLowerInvariant()).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var (addedCount, updatedCount) = await UpsertDefaultSkillsAsync(validSeedItems, cancellationToken);
        int disabledCount = await DeactivateMissingDefaultSkillsAsync(currentSeedIds, cancellationToken);

        await _repository.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "[SkillsSeeder] Синхронизация скилов завершена. Добавлено: {Added}, обновлено: {Updated}, деактивировано: {Disabled}",
            addedCount, updatedCount, disabledCount);
    }

    private List<SkillSeedModel> LoadSeedModels(string? customSeedPath)
    {
        var seedFilePath = ResolveSeedFilePath(customSeedPath);
        if (File.Exists(seedFilePath))
        {
            try
            {
                var json = File.ReadAllText(seedFilePath);
                var items = JsonSerializer.Deserialize<List<SkillSeedModel>>(json);
                if (items is { Count: > 0 })
                {
                    return items;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[SkillsSeeder] Ошибка чтения JSON seed-файла по пути: {Path}", seedFilePath);
            }
        }

        _logger.LogWarning("[SkillsSeeder] Seed-файл не найден или пуст ({Path}). Применяется резервный сид.", seedFilePath);
        return GetFallbackSeedModels();
    }

    private List<(SkillSeedModel Model, SkillStage Stage)> FilterValidSeedItems(IEnumerable<SkillSeedModel> items)
    {
        var validItems = new List<(SkillSeedModel Model, SkillStage Stage)>();
        foreach (var item in items)
        {
            if (SkillStageExtensions.TryParseStage(item.Stage, out var stage))
            {
                validItems.Add((item, stage));
            }
            else
            {
                _logger.LogWarning("[SkillsSeeder] Пропущен скил {Id}: неизвестная стадия '{Stage}'", item.Id, item.Stage);
            }
        }
        return validItems;
    }

    private async Task<(int Added, int Updated)> UpsertDefaultSkillsAsync(
        List<(SkillSeedModel Model, SkillStage Stage)> seedItems,
        CancellationToken ct)
    {
        int added = 0;
        int updated = 0;

        foreach (var (item, stage) in seedItems)
        {
            var normalizedId = item.Id.Trim().ToLowerInvariant();
            var existing = await _repository.GetByIdAsync(normalizedId, ct);

            if (existing == null)
            {
                var skill = Skill.CreateDefault(
                    id: normalizedId,
                    name: item.Name,
                    description: item.Description,
                    stage: stage,
                    content: item.Content,
                    priority: item.Priority,
                    tags: item.Tags);

                await _repository.AddAsync(skill, ct);
                added++;
            }
            else if (existing.IsDefault)
            {
                existing.SyncDefaultTemplate(item.Content);
                await _repository.UpdateAsync(existing, ct);
                updated++;
            }
        }

        return (added, updated);
    }

    private async Task<int> DeactivateMissingDefaultSkillsAsync(HashSet<string> currentSeedIds, CancellationToken ct)
    {
        var allSkills = await _repository.GetAllAsync(ct);
        int disabledCount = 0;

        foreach (var skill in allSkills)
        {
            if (skill.IsDefault && skill.IsEnabled && !currentSeedIds.Contains(skill.Id.Value))
            {
                skill.Disable();
                await _repository.UpdateAsync(skill, ct);
                disabledCount++;
                _logger.LogWarning(
                    "[SkillsSeeder] Дефолтный скил '{SkillId}' отсутствует в seed-файле. Деактивирован.",
                    skill.Id);
            }
        }

        return disabledCount;
    }

    private static string ResolveSeedFilePath(string? customPath)
    {
        if (!string.IsNullOrWhiteSpace(customPath) && File.Exists(customPath))
        {
            return customPath;
        }

        string[] candidates =
        [
            Path.Combine(AppContext.BaseDirectory, "skills_seed.json"),
            Path.Combine(AppContext.BaseDirectory, "src", "Skills", "Infrastructure", "Seeding", "skills_seed.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "src", "Skills", "Infrastructure", "Seeding", "skills_seed.json"),
            Path.Combine(Directory.GetCurrentDirectory(), "skills_seed.json")
        ];

        return candidates.FirstOrDefault(File.Exists) ?? candidates[0];
    }

    private static List<SkillSeedModel> GetFallbackSeedModels() =>
    [
        new()
        {
            Id = "skill-remotion-scene-default",
            Name = "Remotion TSX Scene Best Practices",
            Description = "Базовые правила реактивной генерации сцен для Remotion (Tailwind, spring, clamp)",
            Stage = "scene_generation",
            Content = "1. Всегда используй абсолютное позиционирование `absolute inset-0` для слоев сцены.\n2. Для плавной анимации применяй `spring({ fps, frame, config: { damping: 14, mass: 0.8 } })`.\n3. Избегай хардкода длительности, используй `useVideoConfig()`.\n4. Для текста используй безопасную зону субтитров (отступ снизу не менее 120px для вертикальных Shorts).",
            Priority = 100,
            Tags = ["remotion", "react", "motion", "tsx"]
        },
        new()
        {
            Id = "skill-hook-retention-analyzer",
            Name = "Hook Retention Analyzer",
            Description = "Правила удержания внимания первых 3-х секунд видео",
            Stage = "hook_analysis",
            Content = "1. Первый кадр обязан содержать динамический визуальный триггер или парадокс.\n2. Текстовый заголовок не дублирует слова диктора, а усиливает интригу (curiosity gap).\n3. Скорость смены визуального плана в первые 3 секунды: каждые 0.8-1.2 секунды.",
            Priority = 100,
            Tags = ["hook", "retention", "analytics"]
        }
    ];
}
