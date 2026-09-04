# Vidora backend2 (.NET) — целевая структура и план реализации

Ниже представлена целевая структура папок для C# (.NET 10) в рамках модульного монолита Vidora по принципам Domain-Driven Design (DDD), а затем — подробный поэтапный план реализации каждого модуля.

## 1. Структура папок (только каталоги, без файлов)

Данная структура реализует Clean Architecture / Ports & Adapters (Гексагональную архитектуру) внутри каждого ограниченного контекста (Bounded Context), гарантируя изоляцию доменных инвариантов от инфраструктуры.

Корень `backend2/` минимален: конфигурация, композиционный корень и `src/`, внутри которого живут все модули.

```text
backend2/
├── backend2.csproj
├── Program.cs                  # композиционный корень (wiring)
├── appsettings.json
├── appsettings.Development.json
├── Properties/
│   └── launchSettings.json
├── docs/                       # планирование и архитектура
└── src/
    ├── Api/
    │   ├── Common/
    │   │   ├── Filters/
    │   │   └── Middleware/
    │   ├── Endpoints/
    │   │   ├── Media/
    │   │   ├── Motion/
    │   │   ├── Production/
    │   │   ├── Research/
    │   │   ├── Skills/
    │   │   ├── System/
    │   │   └── Voice/
    │   └── WebSockets/
    ├── Integrations/
    │   ├── FFmpeg/
    │   ├── LLM/
    │   ├── Pexels/
    │   └── YouTube/
    ├── Kernel/
    │   ├── Contracts/
    │   ├── Events/
    │   ├── Exceptions/
    │   ├── Platform/
    │   │   ├── Config/
    │   │   ├── FileSystem/
    │   │   ├── Gpu/
    │   │   ├── Logging/
    │   │   ├── Process/
    │   │   └── WebSockets/
    │   └── Ports/
    ├── Media/
    │   ├── Application/
    │   │   ├── Commands/
    │   │   ├── Queries/
    │   │   └── Services/
    │   ├── Contracts/
    │   ├── Domain/
    │   │   ├── Entities/
    │   │   ├── Events/
    │   │   ├── Ports/
    │   │   └── ValueObjects/
    │   └── Infrastructure/
    │       ├── Normalization/
    │       └── Persistence/
    ├── Motion/
    │   ├── Application/
    │   │   ├── Commands/
    │   │   ├── Queries/
    │   │   └── Services/
    │   ├── Contracts/
    │   ├── Domain/
    │   │   ├── Entities/
    │   │   ├── Events/
    │   │   ├── Ports/
    │   │   └── ValueObjects/
    │   └── Infrastructure/
    │       ├── Parsing/
    │       ├── Persistence/
    │       └── Remotion/
    ├── Production/
    │   ├── Application/
    │   │   ├── Commands/
    │   │   ├── Queries/
    │   │   ├── Sagas/
    │   │   └── Services/
    │   ├── Contracts/
    │   ├── Domain/
    │   │   ├── Entities/
    │   │   ├── Events/
    │   │   ├── Ports/
    │   │   └── ValueObjects/
    │   └── Infrastructure/
    │       ├── Export/
    │       ├── Parsing/
    │       └── Persistence/
    ├── Research/
    │   ├── Application/
    │   │   ├── Commands/
    │   │   ├── Pipelines/
    │   │   ├── Queries/
    │   │   └── Services/
    │   ├── Contracts/
    │   ├── Domain/
    │   │   ├── Entities/
    │   │   ├── Events/
    │   │   ├── Ports/
    │   │   ├── Services/
    │   │   └── ValueObjects/
    │   └── Infrastructure/
    │       ├── Caching/
    │       ├── Export/
    │       └── Ingestors/
    ├── Skills/
    │   ├── Application/
    │   │   ├── Commands/
    │   │   ├── Queries/
    │   │   └── Services/
    │   ├── Contracts/
    │   ├── Domain/
    │   │   ├── Entities/
    │   │   ├── Events/
    │   │   ├── Ports/
    │   │   └── ValueObjects/
    │   └── Infrastructure/
    │       ├── Persistence/
    │       └── Seeding/
    └── System/
        └── Application/
            ├── Queries/
            └── Services/
```

## 2. План по созданию каждого модуля

План построен по принципу **снизу вверх (bottom-up)**: от фундамента платформы и независимых вспомогательных сервисов к ядру бизнес-логики и презентационному слою. Это исключает циклические зависимости и блокировки при разработке.

### Этап 1. Общее ядро и Платформа (`Kernel`)
*Цель: создать общий технический базис и контракты, не содержащие бизнес-логики, от которых зависят все Bounded Contexts.*

1. **Базовые исключения (`Kernel/Exceptions`):**
   - Создать `DomainException`, `ResourceNotFoundException`, `SecurityPathViolationException`, `ValidationException`.
   - Определить единый конверт ошибки (`ErrorEnvelope`) для согласованности с API.
2. **Шина доменных событий (`Kernel/Events`):**
   - Реализовать интерфейс `IDomainEvent` (`Id`, `OccurredAt`, `AggregateId`).
   - Реализовать легковесную in-process шину событий на базе `System.Threading.Channels` (`IEventBus`, `InMemoryEventBus`) без внешних брокеров сообщений.
3. **Платформенные сервисы (`Kernel/Platform`):**
   - `FileSystem`: песочница путей (`IPathResolver`), проверка `allowed_roots`, защита от Path Traversal.
   - `Process`: супервизор процессов (`IProcessSupervisor`) с поддержкой Windows Job Objects для гарантированного закрытия дочерних CLI/воркеров.
   - `Gpu`: семафор/блокировка VRAM (`IGpuManager`) для предотвращения OOM между моделями и Chromium.
   - `WebSockets`: шлюз прогресса (`IWebSocketGateway`) для широковещательных уведомлений фронтенда.
4. **Порты ядра (`Kernel/Ports`):**
   - Объявить абстрактные порты для внешних зависимостей: `ILlmClient`, `IFfmpegClient`, `IRemotionRunner`.

### Этап 2. Контекст скилов (`Skills`)
*Цель: централизовать хранилище промпт-пакетов, которые требуются для кодогенерации (Motion) и аналитики (Research).*

1. **Domain:**
   - Сущность `Skill` (корень агрегата) и перечисление `SkillStage` (`scene_generation`, `hook_analysis`, `script_drafting` и др.).
   - Инварианты: правила валидации стадии, приоритета и версионирования.
   - Доменный сервис `PromptBuilder` для компоновки скилов под лимит контекстного окна LLM.
2. **Infrastructure:**
   - Слой персистентности на SQLite (EF Core или Dapper) для таблицы `skills`.
   - Модуль Seeding: парсер `skills_seed.json` и синхронизация дефолтных скилов при старте.
3. **Application:**
   - Use Cases: `GetSkillsByStageQuery`, `CreateCustomSkillCommand`, `UpdateSkillCommand`, `ResetSkillToDefaultCommand`.
4. **Contracts:**
   - Публичный фасад `ISkillsCatalog`: метод `GetSkillBundleForStage(SkillStage stage)`. Все остальные контексты обращаются только через него.

### Этап 3. Общие интеграционные адаптеры (`Integrations`)
*Цель: реализовать порты ядра к внешним CLI и API до сборки исполняющих контекстов.*

1. **`Integrations/LLM`:**
   - Реализация `ILlmClient`: подключение к локальным/облачным моделям с поддержкой JSON Mode и стриминга токенов.
2. **`Integrations/FFmpeg`:**
   - Реализация низкоуровневых операций: чтение метаданных (`ffprobe`), базовая нарезка, склейка потоков.
3. **`Integrations/Pexels` & `YouTube`:**
   - HTTP-клиенты для стоков и скрапинга метаданных.

### Этап 4. Контекст медиа и ассетов (`Media`)
*Цель: подготовить изолированную обработку графики, стоковых видео и аудио-подложек.*

1. **Domain:**
   - Агрегат `MediaAsset` (видео, изображение, аудио).
   - Value Objects: `MediaDimensions`, `AspectRatio`, `Duration`.
2. **Infrastructure:**
   - `Normalization`: адаптер поверх FFmpeg для приведения B-roll к единому FPS, разрешению (16:9 / 9:16) и замыливанию полей (`blur_pad`).
   - Локальное хранилище каталога треков и загруженных ассетов.
3. **Application:**
   - Use Cases: `UploadMediaAssetCommand`, `NormalizeBrollCommand`, `SearchStockVideosQuery`, `GetMusicCatalogQuery`.
4. **Contracts:**
   - Фасад `IMediaModule`: отдача нормализованных путей и метаданных для монтажа.

### Этап 5. Контекст озвучки и звукорежиссуры (`Voice`)
*Цель: инкапсулировать синтез речи, forced-alignment слов и пост-обработку звука.*

1. **Domain:**
   - Агрегат `TtsJob` и `BatchJob`.
   - Value Objects: `VoiceSpec` (тембр, движок, скорость), `TimedWord` (слово + таймкод начала/конца), `AudioFilterSpec`.
   - Доменные события: `VoiceGeneratedEvent`, `BatchVoiceDoneEvent`, `AlignmentProducedEvent`.
2. **Infrastructure:**
   - Провайдеры TTS: адаптеры к локальным моделям и сервисам (через порт GPU).
   - Выравнивание (Alignment): интеграция с Whisper для получения пословных таймкодов.
   - Фильтры и дакинг: подавление шума, вырезание пауз, автоматическое приглушение музыки под голос.
3. **Application:**
   - Use Cases: `SynthesizeSpeechCommand`, `BatchSynthesizeCommand`, `AlignAudioCommand`, `ApplyDuckingCommand`.
4. **Contracts:**
   - Фасад `IVoiceModule`: генерация реплик и отдача синхронизированных таймингов.

### Этап 6. Контекст кода сцен и рендера (`Motion`)
*Цель: отвечать за генерацию TSX-компонентов Remotion и превращение их в видеокадры.*

1. **Domain:**
   - Агрегат `SceneCode` с коллекцией `SceneRevision` (история изменений/откатов кода).
   - Агрегат `RenderJob` (статусы: `Queued`, `Rendering`, `Muxing`, `Done`, `Failed`).
   - Доменные события: `SceneCodeGeneratedEvent`, `RenderProgressEvent`, `RenderFinishedEvent`.
2. **Infrastructure:**
   - `Parsing`: валидация TSX кода, изолирование зависимостей и подстановка заглушек под отсутствующие ассеты.
   - `Remotion`: воркер запуска рендера через CLI Remotion в отдельном процессе.
   - Репозиторий истории кода на базе локальных файлов.
3. **Application:**
   - Use Cases: `GenerateSceneCodeCommand` (запрашивает скилы через `ISkillsCatalog`), `StartRenderJobCommand`, `CancelRenderJobCommand`.
4. **Contracts:**
   - Фасад `IMotionModule`: генерация кода сцены, управление ревизиями, запуск рендера и отслеживание статуса.

### Этап 7. Контекст продакшена и оркестрации (`Production`)
*Цель: владеть сценарной моделью проекта и координировать вызовы Voice, Motion и Media для создания итогового видео.*

1. **Domain:**
   - Корень агрегата `Project`: список `Scene`, настройки монтажа `MontageSettings`, текущая стадия `PipelineStage`.
   - Сущность `Scene` и `SceneFragment` (ссылаются на ассеты чужих контекстов только по ID).
   - Доменные события: `SceneTimingsUpdatedEvent`, `ProjectExportedEvent`.
2. **Infrastructure:**
   - Парсер сценариев (`SCENARIO.md`).
   - Репозиторий манифеста рабочей директории проекта (`manifest.json`).
   - Экспорт: финальное сведение и склейка всех сцен в единый MP4.
3. **Application:**
   - Use Cases: `CreateProjectCommand`, `ParseScenarioCommand`, `UpdateFragmentCommand`.
   - **Сага `ProductionPipelineSaga`**: слушает события или координирует вызовы:
     - Озвучить фрагменты (через `IVoiceModule`) → обновить тайминги → сгенерировать код (через `IMotionModule`) → запустить рендер сцен → собрать финальный ролик.
4. **Contracts:**
   - Фасад `IProductionModule`: управление проектом и полный запуск производственного конвейера.

### Этап 8. Контекст исследований и виральности (`Research`)
*Цель: обособленная аналитическая ветка (DeepTrend) для поиска и валидации идей.*

1. **Domain:**
   - Агрегат `ResearchRun`, сущности `VideoCandidate`, `EarlySignal`, `Opportunity`.
   - Чистые доменные сервисы: `MomentumEngine`, `BlueOceanDetector`, `ConfusionDetector`, `CommentGoldmineExtractor`.
2. **Infrastructure:**
   - Парсеры поисковой выдачи YouTube, транскрибация превью-роликов, экспорт отчётов в Excel (`.xlsx`).
   - In-memory кэширование повторных запросов.
3. **Application:**
   - DAG-пайплайн: оркестрация параллельного сбора сигналов, фильтрации и обогащения через LLM в виде асинхронного потока (`IAsyncEnumerable`).
4. **Contracts:**
   - Фасад `IResearchModule`: запуск сессий поиска трендов и генерации идей.

### Этап 9. Контекст хоста (`System`)
*Цель: предоставить административные сведения о сервере.*

1. **Application:**
   - Сбор информации о загрузке железа (CPU, RAM, GPU VRAM через `System.Diagnostics` / P/Invoke).
   - Чтение локальных JSONL-логов.
   - Запуск скачивания системных весов/моделей через `IProcessSupervisor`.

### Этап 10. Слой представления (`Api`) и сборка приложения
*Цель: связать Bounded Contexts через Dependency Injection и предоставить HTTP/WebSocket интерфейсы.*

1. **Эндпоинты (`Api/Endpoints`):**
   - Реализовать Minimal API эндпоинты, сгруппированные по контекстам (`ProductionEndpoints`, `VoiceEndpoints` и т.д.).
   - Роль эндпоинтов строго ограничена: прием запроса → валидация DTO → вызов Use Case соответствующего модуля → возврат ответа.
2. **WebSocket Hub (`Api/WebSockets`):**
   - Трансляция событий платформы (`AUDIO_GEN_PROGRESS`, `RENDER_PROGRESS`) напрямую на фронтенд.
3. **Middleware & Filters:**
   - Глобальный перехват доменных исключений (`Kernel/Exceptions`) с маппингом на HTTP-коды (404, 400, 422, 500).
4. **Композиционный корень (`Program.cs`):**
   - Регистрация внутренних сервисов и репозиториев каждого BC через extension-методы (`AddProductionContext()`, `AddVoiceContext()` и т.д.).
   - Запуск шины событий и фоновых воркеров.
