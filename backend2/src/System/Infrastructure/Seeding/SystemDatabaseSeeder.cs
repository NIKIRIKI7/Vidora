using Microsoft.Extensions.Logging;
using SystemContext.Domain;
using SystemContext.Domain.Entities;
using SystemContext.Domain.Ports;

namespace SystemContext.Infrastructure.Seeding;

public sealed class SystemDatabaseSeeder
{
    private readonly ISystemSettingRepository _settingRepo;
    private readonly IAiModelRepository _modelRepo;
    private readonly ILogger<SystemDatabaseSeeder> _logger;

    public SystemDatabaseSeeder(
        ISystemSettingRepository settingRepo,
        IAiModelRepository modelRepo,
        ILogger<SystemDatabaseSeeder> logger)
    {
        _settingRepo = settingRepo;
        _modelRepo = modelRepo;
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
            SystemSetting.Create("motion.gl_backend", "swangle", "Графический бэкенд Remotion (swangle, swiftshader, angle)", "string"),
            SystemSetting.Create("motion.concurrency", "2", "Количество параллельных вкладок рендера Remotion", "int"),
            SystemSetting.Create("voice.alignment_engine_default", "Whisper", "Движок выравнивания по умолчанию (Whisper, Native, Passthrough)", "string"),
            SystemSetting.Create("voice.whisper_model_path", "ai-models/whisper/small.pt", "Путь к весам модели Whisper для выравнивания", "string"),
            SystemSetting.Create("voice.whisper_device", "cuda", "Устройство инференса Whisper (cuda, cpu)", "string"),
            SystemSetting.Create("voice.omnivoice_dir", "ai-models/omnivoice", "Директория с локальной моделью OmniVoice", "string"),
            SystemSetting.Create("integrations.openai.api_key", "", "API-ключ OpenAI для Speech API", "string"),
            SystemSetting.Create("integrations.minimax.api_key", "", "API-ключ MiniMax Audio", "string"),
            SystemSetting.Create("integrations.minimax.group_id", "", "Group ID MiniMax", "string"),
            SystemSetting.Create("gpu.vram_headroom_mb", "1024", "Резервный буфер VRAM (МБ), удерживаемый свободным", "int"),
            SystemSetting.Create("logging.retention_days", "14", "Срок ротации локальных JSONL-логов", "int")
        };

        foreach (var setting in defaultSettings)
        {
            if (!await _settingRepo.ExistsAsync(setting.Id, ct))
            {
                _logger.LogInformation("[SystemSeeder] Регистрация настройки {Key}...", setting.Id);
                await _settingRepo.AddAsync(setting, ct);
            }
        }
        await _settingRepo.SaveChangesAsync(ct);

        var defaultModels = new[]
        {
            AiModelArtifact.Create(
                id: "whisper-small",
                name: "Whisper Small ASR (Word Alignment)",
                category: ModelCategory.Stt,
                targetDirectory: "ai-models/whisper/small.pt",
                downloadUrl: "https://openaipublic.azureedge.net/main/whisper/models/9ecf0799841e8ce0a75712c9d0b38020df23273a5a18e4b4faedfc2b6505d549/small.pt",
                expectedSizeBytes: 483_785_135,
                version: "small",
                isRequired: true,
                sha256Checksum: "9ecf0799841e8ce0a75712c9d0b38020df23273a5a18e4b4faedfc2b6505d549"),

            AiModelArtifact.Create(
                id: "omnivoice",
                name: "OmniVoice Diffusion Zero-Shot TTS",
                category: ModelCategory.Tts,
                targetDirectory: "ai-models/omnivoice",
                downloadUrl: "",
                expectedSizeBytes: 1_850_000_000,
                version: "1.0",
                isRequired: false),

            AiModelArtifact.Create(
                id: "cosyvoice-300m",
                name: "CosyVoice 300M Instruct",
                category: ModelCategory.Tts,
                targetDirectory: "ai-models/cosyvoice",
                downloadUrl: "",
                expectedSizeBytes: 1_288_490_188,
                version: "1.0",
                isRequired: false),

            AiModelArtifact.Create(
                id: "fishaudio-local",
                name: "Fish Audio Local",
                category: ModelCategory.Tts,
                targetDirectory: "ai-models/fishaudio",
                downloadUrl: "",
                expectedSizeBytes: 1_500_000_000,
                version: "1.4",
                isRequired: false),

            AiModelArtifact.Create(
                id: "kokoro-v0_19",
                name: "Kokoro TTS Engine",
                category: ModelCategory.Tts,
                targetDirectory: "ai-models/kokoro",
                downloadUrl: "",
                expectedSizeBytes: 335_544_320,
                version: "0.19",
                isRequired: true),

            AiModelArtifact.Create(
                id: "remotion-chromium",
                name: "Headless Chromium for Remotion",
                category: ModelCategory.Chromium,
                targetDirectory: "ai-models/chromium",
                downloadUrl: "",
                expectedSizeBytes: 293_601_280,
                version: "128.0",
                isRequired: true)
        };

        foreach (var model in defaultModels)
        {
            if (!await _modelRepo.ExistsAsync(model.Id, ct))
            {
                _logger.LogInformation("[SystemSeeder] Регистрация каталожной записи модели {ModelId}...", model.Id);
                await _modelRepo.AddAsync(model, ct);
            }
        }
        await _modelRepo.SaveChangesAsync(ct);
        _logger.LogInformation("[SystemSeeder] Инициализация системных конфигураций успешно завершена.");
    }
}
