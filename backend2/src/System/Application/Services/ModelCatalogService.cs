using System.IO;
using Kernel.Platform.Config;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SystemContext.Contracts;
using SystemContext.Domain;
using SystemContext.Domain.Ports;

namespace SystemContext.Application.Services;

public interface IModelCatalogService
{
    Task<IReadOnlyList<ModelCatalogEntryDto>> GetCatalogAsync(ModelTaskRole? role = null, CancellationToken ct = default);
}

public sealed class ModelCatalogService : IModelCatalogService
{
    private readonly ILocalModelScanner _ggufResolver;
    private readonly IAiModelRepository _aiModelRepo;
    private readonly ISystemSettingRepository _settingRepo;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<ModelCatalogService> _logger;

    public ModelCatalogService(
        ILocalModelScanner ggufResolver,
        IAiModelRepository aiModelRepo,
        ISystemSettingRepository settingRepo,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<ModelCatalogService> logger)
    {
        _ggufResolver = ggufResolver;
        _aiModelRepo = aiModelRepo;
        _settingRepo = settingRepo;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public async Task<IReadOnlyList<ModelCatalogEntryDto>> GetCatalogAsync(ModelTaskRole? role = null, CancellationToken ct = default)
    {
        var entries = new List<ModelCatalogEntryDto>();

        // 1. Сканируем локальные GGUF модели через IGgufModelResolver
        try
        {
            var ggufFiles = _ggufResolver.FindAllGgufFiles();
            foreach (var file in ggufFiles)
            {
                var fileName = Path.GetFileNameWithoutExtension(file);
                var lower = fileName.ToLowerInvariant();
                var roles = new List<ModelTaskRole> { ModelTaskRole.ScenarioDrafting, ModelTaskRole.SceneCodeGeneration, ModelTaskRole.BRollMatching };

                entries.Add(new ModelCatalogEntryDto(
                    Id: fileName,
                    Name: FormatModelName(fileName),
                    Provider: "local_gguf",
                    Mode: "local",
                    Roles: roles,
                    IsAvailable: true,
                    StatusDetails: $"Локальный файл ({Math.Round(new FileInfo(file).Length / (1024.0 * 1024 * 1024), 2)} GB)"
                ));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[ModelCatalog] Ошибка поиска локальных GGUF");
        }

        // 2. Сканируем локальные аудио/STT/TTS артефакты из БД
        try
        {
            var artifacts = await _aiModelRepo.GetAllAsync(ct);
            foreach (var art in artifacts)
            {
                var roles = art.Category switch
                {
                    ModelCategory.Tts => new[] { ModelTaskRole.TtsVoice },
                    ModelCategory.Stt => new[] { ModelTaskRole.SttAlignment },
                    _ => Array.Empty<ModelTaskRole>()
                };

                if (roles.Length == 0) continue;

                entries.Add(new ModelCatalogEntryDto(
                    Id: art.Id,
                    Name: art.Name,
                    Provider: "local_voice",
                    Mode: "local",
                    Roles: roles,
                    IsAvailable: art.Status == ModelDownloadStatus.Ready,
                    StatusDetails: art.Status == ModelDownloadStatus.Ready ? "Готов" : art.ErrorMessage ?? "Не загружен"
                ));
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[ModelCatalog] Ошибка чтения аудио-моделей");
        }

        // 3. Проверяем доступность облачных провайдеров через настройки системы
        var routerKey = await _settingRepo.GetByKeyAsync("integrations.routerai.api_key", ct);
        var tunnelKey = await _settingRepo.GetByKeyAsync("integrations.aitunnel.api_key", ct);
        var openAiKey = await _settingRepo.GetByKeyAsync("integrations.openai.api_key", ct);
        var miniMaxKey = await _settingRepo.GetByKeyAsync("integrations.minimax.api_key", ct);

        bool hasRouterAi = !string.IsNullOrWhiteSpace(routerKey?.Value);
        bool hasAiTunnel = !string.IsNullOrWhiteSpace(tunnelKey?.Value);
        bool hasOpenAi = !string.IsNullOrWhiteSpace(openAiKey?.Value);
        bool hasMiniMax = !string.IsNullOrWhiteSpace(miniMaxKey?.Value);

        // Облачные LLM модели
        var cloudLlms = new[]
        {
            ("anthropic/claude-sonnet-5", "Claude 3.7 Sonnet (Anthropic)", new[] { ModelTaskRole.ScenarioDrafting, ModelTaskRole.SceneCodeGeneration, ModelTaskRole.BRollMatching }),
            ("anthropic/claude-3.5-sonnet", "Claude 3.5 Sonnet (Anthropic)", new[] { ModelTaskRole.ScenarioDrafting, ModelTaskRole.SceneCodeGeneration, ModelTaskRole.BRollMatching }),
            ("openai/gpt-4o", "GPT-4o (OpenAI)", new[] { ModelTaskRole.ScenarioDrafting, ModelTaskRole.SceneCodeGeneration, ModelTaskRole.BRollMatching }),
            ("openai/gpt-4o-mini", "GPT-4o Mini (OpenAI)", new[] { ModelTaskRole.ScenarioDrafting, ModelTaskRole.BRollMatching }),
            ("google/gemini-2.5-pro", "Gemini 2.5 Pro (Google)", new[] { ModelTaskRole.ScenarioDrafting, ModelTaskRole.SceneCodeGeneration }),
            ("deepseek/deepseek-r1", "DeepSeek R1 (DeepSeek)", new[] { ModelTaskRole.ScenarioDrafting }),
            ("deepseek/deepseek-chat", "DeepSeek V3 (DeepSeek)", new[] { ModelTaskRole.ScenarioDrafting, ModelTaskRole.BRollMatching })
        };

        foreach (var (id, name, roles) in cloudLlms)
        {
            bool available = hasRouterAi || hasAiTunnel || (id.StartsWith("openai/") && hasOpenAi);
            entries.Add(new ModelCatalogEntryDto(
                Id: id,
                Name: name,
                Provider: hasRouterAi ? "routerai" : hasAiTunnel ? "aitunnel" : "openai",
                Mode: "cloud",
                Roles: roles,
                IsAvailable: available,
                StatusDetails: available ? "API подключен" : "Требуется API-ключ шлюза"
            ));
        }

        // Облачные TTS модели
        entries.Add(new ModelCatalogEntryDto(
            Id: "minimax/speech-2.8-hd",
            Name: "MiniMax Speech 2.8 HD",
            Provider: "minimax",
            Mode: "cloud",
            Roles: [ModelTaskRole.TtsVoice],
            IsAvailable: hasMiniMax,
            StatusDetails: hasMiniMax ? "API подключен" : "Требуется MiniMax API-ключ"
        ));

        entries.Add(new ModelCatalogEntryDto(
            Id: "openai/tts-1-hd",
            Name: "OpenAI TTS 1 HD",
            Provider: "openai",
            Mode: "cloud",
            Roles: [ModelTaskRole.TtsVoice],
            IsAvailable: hasOpenAi,
            StatusDetails: hasOpenAi ? "API подключен" : "Требуется OpenAI API-ключ"
        ));

        // Фильтрация по роли при наличии
        return role.HasValue
            ? entries.Where(e => e.Roles.Contains(role.Value)).ToList()
            : entries;
    }

    private static string FormatModelName(string fileName)
    {
        var clean = fileName.Replace('-', ' ').Replace('_', ' ');
        return char.ToUpperInvariant(clean[0]) + clean[1..];
    }
}