using Kernel.Platform.Config;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using SystemContext.Domain;
using SystemContext.Domain.Entities;
using SystemContext.Domain.Ports;

namespace SystemContext.Infrastructure.Seeding;

public sealed class SystemDatabaseSeeder
{
    private readonly ISystemSettingRepository _settingRepo;
    private readonly IAiModelRepository _modelRepo;
    private readonly AppStorageConfig _storageConfig;
    private readonly ILogger<SystemDatabaseSeeder> _logger;

    public SystemDatabaseSeeder(
        ISystemSettingRepository settingRepo,
        IAiModelRepository modelRepo,
        IOptions<AppStorageConfig> storageConfig,
        ILogger<SystemDatabaseSeeder> logger)
    {
        _settingRepo = settingRepo;
        _modelRepo = modelRepo;
        _storageConfig = storageConfig.Value;
        _logger = logger;
    }

    public async Task SeedAsync(CancellationToken ct = default)
    {
        _logger.LogInformation("[SystemSeeder] Проверка системных настроек и конфигурации моделей...");

        var defaultSettings = new[]
        {
            SystemSetting.Create("system.app_name", "Vidora Engine", "Название сервиса", "string", isReadOnly: true),
            SystemSetting.Create("system.default_locale", "ru-RU", "Язык интерфейса и генерации", "string"),
            SystemSetting.Create("motion.default_fps", "30", "Базовый FPS рендера", "int"),
            SystemSetting.Create("motion.gl_backend", "swangle", "Графический бэкенд Remotion", "string"),
            SystemSetting.Create("motion.concurrency", "2", "Количество вкладок рендера", "int"),
            SystemSetting.Create("voice.alignment_engine_default", "Whisper", "Движок выравнивания", "string"),
            SystemSetting.Create("voice.whisper_model_path", _storageConfig.GetModelPath("whisper/faster-whisper-small"), "Путь к директории модели faster-whisper (CTranslate2)", "string"),
            SystemSetting.Create("voice.whisper_device", "cuda", "Устройство инференса Whisper", "string"),
            SystemSetting.Create("voice.omnivoice_dir", _storageConfig.GetModelPath("omnivoice"), "Директория модели OmniVoice", "string"),
            SystemSetting.Create("voice.cosyvoice_dir", _storageConfig.GetModelPath("cosyvoice"), "Директория модели CosyVoice", "string"),
            SystemSetting.Create("gpu.vram_headroom_mb", "1024", "Резервный буфер VRAM (МБ)", "int"),
            SystemSetting.Create("logging.retention_days", "14", "Срок ротации логов", "int")
        };

        foreach (var setting in defaultSettings)
        {
            var existing = await _settingRepo.GetByKeyAsync(setting.Id, ct);
            if (existing == null)
            {
                await _settingRepo.AddAsync(setting, ct);
            }
            else if (existing.Value.Contains("ai-models/") && !existing.Value.StartsWith(_storageConfig.GetModelsDirectory()))
            {
                var cleanSub = existing.Value.Substring(existing.Value.IndexOf("ai-models/") + "ai-models/".Length);
                existing.UpdateValue(_storageConfig.GetModelPath(cleanSub));
                await _settingRepo.UpdateAsync(existing, ct);
            }
        }
        await _settingRepo.SaveChangesAsync(ct);

        var defaultModels = new[]
        {
            AiModelArtifact.Create(
                id: "whisper-small-ct2",
                name: "Faster-Whisper Small (CTranslate2 CUDA 12)",
                category: ModelCategory.Stt,
                targetDirectory: _storageConfig.GetModelPath("whisper/faster-whisper-small"),
                downloadUrl: "https://huggingface.co/Systran/faster-whisper-small",
                expectedSizeBytes: 485_000_000,
                version: "small-ct2",
                isRequired: true),

            AiModelArtifact.Create(
                id: "omnivoice",
                name: "OmniVoice Diffusion Zero-Shot TTS",
                category: ModelCategory.Tts,
                targetDirectory: _storageConfig.GetModelPath("omnivoice"),
                downloadUrl: "",
                expectedSizeBytes: 1_850_000_000,
                version: "1.0",
                isRequired: false),

            AiModelArtifact.Create(
                id: "cosyvoice-300m",
                name: "CosyVoice 300M Instruct",
                category: ModelCategory.Tts,
                targetDirectory: _storageConfig.GetModelPath("cosyvoice"),
                downloadUrl: "",
                expectedSizeBytes: 1_288_490_188,
                version: "1.0",
                isRequired: false),

            AiModelArtifact.Create(
                id: "fishaudio-local",
                name: "Fish Audio Local",
                category: ModelCategory.Tts,
                targetDirectory: _storageConfig.GetModelPath("fishaudio"),
                downloadUrl: "",
                expectedSizeBytes: 1_500_000_000,
                version: "1.4",
                isRequired: false),

            AiModelArtifact.Create(
                id: "kokoro-v0_19",
                name: "Kokoro TTS Engine",
                category: ModelCategory.Tts,
                targetDirectory: _storageConfig.GetModelPath("kokoro"),
                downloadUrl: "",
                expectedSizeBytes: 335_544_320,
                version: "0.19",
                isRequired: true),

            AiModelArtifact.Create(
                id: "remotion-chromium",
                name: "Headless Chromium for Remotion",
                category: ModelCategory.Chromium,
                targetDirectory: _storageConfig.GetModelPath("chromium"),
                downloadUrl: "",
                expectedSizeBytes: 293_601_280,
                version: "128.0",
                isRequired: true)
        };

        foreach (var model in defaultModels)
        {
            var existing = await _modelRepo.GetByIdAsync(model.Id, ct);
            if (existing == null)
            {
                await _modelRepo.AddAsync(model, ct);
            }
            else if (!existing.TargetDirectory.StartsWith(_storageConfig.GetModelsDirectory(), StringComparison.OrdinalIgnoreCase))
            {
                var cleanSub = existing.TargetDirectory.Substring(existing.TargetDirectory.IndexOf("ai-models/") + "ai-models/".Length);
                existing.UpdateTargetDirectory(_storageConfig.GetModelPath(cleanSub));
                await _modelRepo.UpdateAsync(existing, ct);
            }
        }
        await _modelRepo.SaveChangesAsync(ct);
        _logger.LogInformation("[SystemSeeder] Инициализация конфигураций путей завершена.");
    }
}
