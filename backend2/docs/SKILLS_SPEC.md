# Skills Context backend2 (.NET) — спецификация
> Область: `backend2/src/Skills/**` + `backend2/src/Api/Endpoints/Skills/**`
> Статус: Этап 2 реализован (Domain + Value Objects + EF Core SQLite + Migrations + Seeder + API).
> Покрытие: покрыто модульными и интеграционными тестами (в составе общего пакета из 71 тестов решения).

---
## 1. Назначение
Контекст `Skills` — централизованный изолированный каталог промпт-пакетов, шаблонов кодогенерации и инструкций LLM для всего конвейера Vidora:
1. Хранение и версионирование системных и пользовательских промпт-пакетов.
2. Изоляция правил генерации компонентов Remotion (`Motion`), анализа виральности (`Research`) и драфтинга сценариев (`Production`).
3. Динамическая компоновка промптов под заданный бюджет токенов контекстного окна LLM (`PromptBuilder`).
4. Автоматическая синхронизация дефолтных скилов платформы при старте приложения (`SkillsSeeder`).
5. Предоставление остальным контекстам строгого фасада `ISkillsCatalog` (прямой доступ к таблицам скилов извне запрещен).

---
## 2. Модули и ответственность

| Модуль | Ключевые типы | Что делает |
|---|---|---|
| `Skills.Domain` | `SkillStage`, `SkillStageExtensions` | Стадии конвейера (`scene_generation`, `hook_analysis`, `script_drafting`, `visual_analysis`, `trend_research`). Парсинг camelCase/snake_case/kebab-case, конвертация в snake_case для БД. Единый источник правды перечисления. |
| `Skills.Domain.ValueObjects` | `SkillId`, `SkillName`, `SkillPriority`, `SkillVersion`, `PromptContent`, `SkillTags` | Доменные объекты-значения: строгая валидация ID (`[a-z0-9_\-]`) и имени, диапазон приоритета (0..1000), монотонная версия (`Next()`), централизованный подсчет токенов текста (`EstimateTokens()`), дедупликация тегов. |
| `Skills.Domain.Entities` | `Skill` (Aggregate Root, `BaseEntity<SkillId>`) | Корень агрегата: защита системных дефолтов от удаления (`PrepareDelete`), отслеживание версий при изменении контента, сброс к эталону (`ResetToDefault`), регистрация доменных событий. |
| `Skills.Domain.Services` | `PromptBuilder`, `PromptCompositionResult` | Доменный сервис компоновки промптов: сортировка по приоритету, фильтрация неактивных, отсечение по лимиту токенов в `OmittedSkills` без падения пайплайна. |
| `Skills.Domain.Events` | `SkillCreatedEvent`, `SkillUpdatedEvent`, `SkillResetEvent`, `SkillDeletedEvent` | Доменные события жизненного цикла скилов для публикации в `IEventBus`. |
| `Skills.Domain.Ports` | `ISkillRepository` | Порт персистентности агрегата `Skill`. |
| `Skills.Contracts` | `ISkillsCatalog`, `SkillDto`, `SkillBundleDto` | Публичный фасад взаимодействия других Bounded Contexts с модулем Skills. |
| `Skills.Application` | `ISkillManagementService`, `SkillManagementService`, команды и запросы | Слой сценариев использования: CRUD скилов, CQRS-запросы (`SkillQueries`), делегирование публикации событий в `SqliteDbContextBase`. |
| `Skills.Infrastructure.Persistence` | `SkillsDbContext`, `EfSkillRepository`, миграции `InitialSkills` | Персистентность на базе `SqliteDbContextBase` (`data_storage/skills.db`): режим WAL, ValueConverters для VO, автонормализация legacy-записей. |
| `Skills.Infrastructure.Seeding` | `SkillsSeeder`, `SkillsSeederHostedService`, `skills_seed.json` | Фоновый hosted-сервис: миграция схемы, сидинг эталонов и автоматическое отключение (`IsEnabled = false`) дефолтных скилов, удаленных из seed-файла. |
| `Api.Endpoints.Skills` | `SkillsEndpoints`, `CreateSkillRequest`, `UpdateSkillRequest` | Minimal API: dual-binding для `snake_case` и `camelCase` свойств (`is_enabled`/`isEnabled`), трансляция ошибок в `ErrorEnvelope`. |

---
## 3. Границы контекста (что Skills НЕ делает)
- Не выполняет сетевых вызовов к LLM: компонует и валидирует текст промпта, но отправку выполняет `Integrations/LLM`.
- Не хранит данные проектов, сцен и сценариев — это зона `Production` и `Motion`.
- Не запрашивает типы других Bounded Contexts: модуль независим и ссылается только на `Kernel`.
- Внешние контексты **не инжектят** `SkillsDbContext` или `ISkillRepository` — взаимодействие строго через `ISkillsCatalog`.

---
## 4. Регистрация и подключение (DI)
Единая точка регистрации — расширение `SkillsServiceExtensions.AddSkillsContext`:

```csharp
// Program.cs
builder.Services.AddSkillsContext(builder.Configuration);

// Маппинг маршрутов в пайплайн
app.MapSkillsEndpoints();
```

Что регистрируется внутри:
- `SkillsDbContext` → SQLite соединение к `<DataStorageDir>/skills.db`.
- `ISkillRepository` → `EfSkillRepository` (Scoped).
- `PromptBuilder` (Singleton).
- `ISkillManagementService` → `SkillManagementService` (Scoped).
- `ISkillsCatalog` → `SkillsCatalog` (Scoped).
- `SkillsSeeder` (Scoped) и `SkillsSeederHostedService` (IHostedService).

Конфигурация директории БД (`appsettings.json`):
```json
{
  "Storage": {
    "DataStorageDir": "data_storage"
  }
}
```

---
## 5. Персистентность, схема данных и миграции
- **Файл базы**: `data_storage/skills.db`.
- **Режим SQLite**: WAL (`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;`) через `SqliteDbContextBase`.
- **Таблица `skills`**:
  - `Id` (TEXT, PK, max 64) — конвертируется через `SkillId`.
  - `Name` (TEXT, max 128, NOT NULL).
  - `Description` (TEXT, max 512).
  - `Stage` (TEXT, max 64, NOT NULL) — хранится строго в `snake_case` (`scene_generation`, `hook_analysis` и т.д.).
  - `Content` (TEXT, NOT NULL) — конвертируется через `PromptContent`.
  - `DefaultContent` (TEXT, NULL) — резервная копия эталона для сброса.
  - `Priority` (INTEGER, NOT NULL) — конвертируется через `SkillPriority`.
  - `Version` (INTEGER, NOT NULL) — конвертируется через `SkillVersion`.
  - `IsDefault` (INTEGER, NOT NULL) — флаг системного скила.
  - `IsEnabled` (INTEGER, NOT NULL) — флаг активности скила.
  - `Tags` (TEXT, NOT NULL) — JSON-массив тегов через `SkillTags`.
  - `CreatedAt`, `UpdatedAt` (TEXT, NOT NULL) — авто-аудит.
- **Индексы**: `IX_skills_Stage`, `IX_skills_IsEnabled`, `IX_skills_Priority`.
- **Миграции и автонормализация**:
  - При старте `SkillsSeederHostedService` автоматически создает `__EFMigrationsHistory`, если база была создана ранее через `EnsureCreatedAsync`.
  - Выполняет `Database.MigrateAsync()`.
  - Выполняет однократный SQL-скрипт нормализации значений `Stage` из старого PascalCase в актуальный `snake_case` (`UPDATE skills SET Stage = 'scene_generation' WHERE Stage = 'SceneGeneration'`).

---
## 6. Как работать с компонентами

### 6.1 Использование публичного фасада `ISkillsCatalog`
Используется в `Motion`, `Research` и `Production`:
```csharp
public class MotionPromptService
{
    private readonly ISkillsCatalog _skillsCatalog;

    public MotionPromptService(ISkillsCatalog skillsCatalog)
    {
        _skillsCatalog = skillsCatalog;
    }

    public async Task<string> PrepareSceneSystemPromptAsync(CancellationToken ct)
    {
        // Получаем скомпонованный бандл под лимит в 3500 токенов
        SkillBundleDto bundle = await _skillsCatalog.GetSkillBundleForStageAsync(
            SkillStage.SceneGeneration,
            maxTokenLimit: 3500,
            customHeaderInstructions: "Generate strictly deterministic React TSX for Remotion.",
            cancellationToken: ct);

        return bundle.SystemPrompt;
    }
}
```

### 6.2 Доменный сервис `PromptBuilder`
Компонует активные скилы, сортируя их по приоритету (убывание). Если скил превышает оставшийся бюджет, он отправляется в `OmittedSkills` без прерывания цепочки:
```csharp
var builder = new PromptBuilder();
var result = builder.BuildBundle(skillsList, tokenLimit: 2000, "Header rules");

// result.ComposedPrompt — готовый текст для System Prompt
// result.IncludedSkills — вошедшие скилы
// result.OmittedSkills — скилы, не уместившиеся в бюджет
// result.TotalEstimatedTokens — оценка расхода токенов
```

### 6.3 Инварианты сущности `Skill` и Value Objects
```csharp
// 1. Создание через типизированные VO
var skill = Skill.Create(
    id: new SkillId("custom-remotion-rule"),
    name: "Custom 3D Physics",
    description: "Rules for ThreeJS canvas inside Remotion",
    stage: SkillStage.SceneGeneration,
    content: new PromptContent("Always dispose geometry cache in useEffect."),
    priority: SkillPriority.High);

// 2. Монотонный инкремент версии при обновлении контента
skill.Update(name, desc, newContent, priority, isEnabled); // Version = Version.Next()

// 3. Защита дефолтных скилов
skill.AssertCanDelete(); // Бросает DomainConflictException (409), если IsDefault == true

// 4. Сброс к исходному эталону
skill.ResetToDefault(); // Восстанавливает Content = DefaultContent, инкрементирует Version
```

### 6.4 Сидинг и синхронизация эталонов (`skills_seed.json`)
- Файл эталонов: `src/Skills/Infrastructure/Seeding/skills_seed.json` (копируется в билд).
- При старте `SkillsSeeder`:
  1. Добавляет новые дефолтные скилы с `IsDefault = true`.
  2. Обновляет `DefaultContent` у существующих дефолтных скилов (не перезаписывая пользовательский `Content`, если тот был изменен).
  3. **FastAPI Parity**: находит дефолтные скилы в БД, отсутствующие в актуальном `skills_seed.json`, и деактивирует их (`skill.Disable()`), предотвращая применение устаревших инструкций.

### 6.5 HTTP API Эндпоинты
Все эндпоинты сгруппированы по префиксу `/api/v1/skills`:

| Метод | Путь | Назначение | Параметры / Тело |
|---|---|---|---|
| `GET` | `/api/v1/skills` | Список всех скилов | `?stage=scene_generation&only_enabled=true` (поддерживает `onlyEnabled`) |
| `GET` | `/api/v1/skills/{id}` | Получение скила по ID | — |
| `GET` | `/api/v1/skills/bundle/{stage}` | Получение скомпонованного бандла | `?max_tokens=4000&custom_header=...` (поддерживает `maxTokens`/`customHeader`) |
| `POST` | `/api/v1/skills` | Создание пользовательского скила | JSON (`CreateSkillRequest`, поля в `snake_case` или `camelCase`) |
| `PUT` | `/api/v1/skills/{id}` | Обновление скила | JSON (`UpdateSkillRequest`, поддержка `is_enabled` и `isEnabled`) |
| `POST` | `/api/v1/skills/{id}/reset` | Сброс дефолтного скила к эталону | — |
| `DELETE` | `/api/v1/skills/{id}` | Удаление пользовательского скила | — (409 Conflict при попытке удалить системный) |

Формат ответа ошибки (через `ExceptionHandlingMiddleware` ядра):
```json
{
  "status": "error",
  "error_code": "CANNOT_DELETE_DEFAULT_SKILL",
  "detail": "Скил 'skill-remotion-scene-engine' является базовым системным скилом платформы. Удаление запрещено. Вы можете отключить его.",
  "details": null,
  "timestamp": "2026-09-03T20:00:00Z"
}
```

---
## 7. Проверка корректности и тесты

### Пакет тестов (71 шт., xUnit)
```powershell
# Запуск полного набора тестов:
dotnet test backend2/tests/Kernel.Tests/Kernel.Tests.csproj
```

Тестовое покрытие контекста `Skills`:
1. **`SkillValueObjectsTests`**:
   - Валидация форматов `SkillId` (регекс `^[a-z0-9_\-]+$`, длина, пробелы).
   - Инварианты диапазона `SkillPriority` (0..1000, исключения на выход из границ).
   - Монотонность инкремента `SkillVersion.Next()`.
   - Точность алгоритма `PromptContent.EstimateTokens()` на коде и кириллице.
   - Дедупликация, нормализация и иммутабельность `SkillTags`.
2. **`SkillsTests`**:
   - Валидация создания агрегата `Skill`.
   - Подавление событий при сидинге (`Skill.CreateDefault` не эмитит `SkillCreatedEvent`).
   - Эмиссия `SkillCreatedEvent` при создании пользовательского скила (`Skill.CreateCustom`).
   - Автоматическая диспетчеризация доменных событий через `SqliteDbContextBase.SaveChangesAsync()`.
   - Инкремент версии при изменении тела промпта.
   - Сброс `ResetToDefault()` и сохранение пользовательских правок при обновлении эталона.
   - Выброс `DomainConflictException` (409) при попытке удаления дефолтного скила.
   - Сортировка по приоритету и бюджетирование токенов в `PromptBuilder`.
   - Отсечение скилов в `OmittedSkills` при переполнении контекстного окна.
   - Проверка сохранения `Stage` в SQLite строго в формате `snake_case`.
   - Тест мигратора: автоматическая нормализация legacy-записей из `SceneGeneration` в `scene_generation`.
   - Автодеактивация устаревших дефолтных скилов в `SkillsSeeder`.
   - Dual-binding `UpdateSkillRequest` для `is_enabled` и `isEnabled`.
3. **`SkillsCatalogTests`**:
   - Сквозное получение бандла через фасад `ISkillsCatalog` на базе SQLite In-Memory.

### Ручной smoke-тест
```powershell
$env:ASPNETCORE_URLS="http://127.0.0.1:5117"
dotnet run --project backend2

# 1. Получить бандл для генерации Remotion-сцен
curl http://127.0.0.1:5117/api/v1/skills/bundle/scene_generation

# 2. Проверить дефолтные скилы
curl http://127.0.0.1:5117/api/v1/skills?stage=hook_analysis

# 3. Попытка удалить системный скил (ожидается 409 Conflict)
curl -X DELETE http://127.0.0.1:5117/api/v1/skills/skill-remotion-scene-engine
```

---
## 8. Конвенции для разработчика
1. **Никакой примитивной одержимости**: внутри домена скилов идентификаторы, имена, приоритеты, версии и контент оборачиваются в Value Objects (`SkillId`, `SkillName`, `SkillPriority`, `SkillVersion`, `PromptContent`, `SkillTags`).
2. **Размещение `SkillStage`**: перечисление находится строго в `Skills.Domain`. Не переносить в `ValueObjects`, чтобы не ломать поиск методов расширения (`ToSnakeCase`, `TryParseStage`).
3. **Управление событиями**: события регистрируются через `AddDomainEvent` в методах агрегата; публикацию берёт на себя `SqliteDbContextBase`. `SkillManagementService` не использует `IEventBus` напрямую.
4. **Изоляция сидинга**: методы сидинга создают сущности через `Skill.CreateDefault`, отключающий генерацию событий, чтобы не нагружать шину при старте хоста.
5. **Безопасность операторов**: запрещено добавлять операторы неявного приведения коллекций к `SkillTags` (`List<string> -> SkillTags`), так как это вызывает циклический `StackOverflowException` при материализации сущностей EF Core. Создание `SkillTags` выполняется явно через конструктор или фабрики `FromJson`/`FromCsv`.
6. **Конфликты инвариантов**: при нарушении бизнес-правил состояния агрегата выбрасывается `DomainConflictException` (маппится в HTTP 409). Использование абстрактного `DomainException` запрещено (ошибка компиляции CS0144).
7. **Внешняя интеграция**: модули `Motion`, `Research` и `Production` не должны иметь ссылок на внутренности `Skills.Infrastructure` или `Skills.Domain.Entities`. Все запросы идут только через контракт `ISkillsCatalog`.
