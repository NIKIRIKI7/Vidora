# backend2 (.NET) — RUNBOOK: запуск, миграции, тесты

> Область: `backend2/**`. Все команды — из корня репозитория `Vidora` в PowerShell.
> Решение (`.sln`) отсутствует, поэтому проекты и тестовые сборки указываются путём явно.

---

## 0. Требования

| Компонент | Зачем | Проверка / установка |
|---|---|---|
| **.NET SDK 10** | сборка и запуск backend2 | `dotnet --version` → `10.x` |
| **dotnet-ef 9.0.2** | создание миграций (только при изменении модели) | `dotnet ef --version`; установка: `dotnet tool install --global dotnet-ef --version 9.0.2` |
| Node 20+ и pnpm | фронтенд (опционально) | `pnpm -v` |
| Python 3.11+ | локальный TTS-воркер (опционально) | `python --version` |
| NVIDIA + CUDA | инференс Whisper/LLM на GPU (опционально) | `nvidia-smi` |
| FFmpeg, Node 22 | рендер Remotion (в комплекте в `backend2/tools`) | — |

---

## 1. Первичная установка

```powershell
# Бэкенд
cd backend2
dotnet restore

# Фронтенд (опционально)
cd ..\frontend
pnpm install
```

## 2. Базы данных и миграции

### 2.1. Как применяются

Все 7 bounded context'ов используют **полноценные EF Core миграции**. Применяются CLI-флагом `--migrate` (обрабатывается в `Program.cs`): прогоняет `MigrateAsync` по всем контекстам + запускает сидеры, затем процесс завершается. Авто-миграции при обычном старте приложения отключены.

```powershell
cd backend2
dotnet run -- --migrate
```

Через фронтенд:

```powershell
cd frontend
pnpm backend:migrate
```

| БД (`backend2/data_storage/`) | Контекст | Базовая миграция |
|---|---|---|
| `skills.db` | Skills | `20260903000001_InitialSkills` |
| `system.db` | System | `20260903000002_InitialSystem` |
| `media.db` | Media | `20260903000003_InitialMedia` |
| `voice.db` | Voice | `20260912173305_InitialVoice` |
| `motion.db` | Motion | `20260912173323_InitialMotion` |
| `production.db` | Production | `20260912173339_InitialProduction` |
| `research.db` | Research | `20260912173411_InitialResearch` |

Порядок первого запуска: `dotnet restore` → `dotnet run -- --migrate` → `dotnet run`. Повторный `--migrate` идемпотентен.

### 2.2. Baseline для старых БД (shim)

Если БД была создана раньше через `EnsureCreated` (нет таблицы `__EFMigrationsHistory`), `--migrate` **не пересоздаёт её и не трогает данные**: менеджер (`DatabaseMigrationManager`) видит существующую доменную таблицу, вставляет запись базовой миграции в `__EFMigrationsHistory` и дальше применяет обычные миграции. В логе это видно как `[MigrationShim] Обнаружена существующая таблица ...`.

Ручной baseline (например, чистая проверка) обычно не нужен — достаточно `dotnet run -- --migrate`.

### 2.3. Добавление новой миграции

Каталоги и namespace'и миграций по контекстам:

| Контекст | `-c` | `-o` (от каталога `backend2`) | `-n` |
|---|---|---|---|
| Skills | `SkillsDbContext` | `src/Skills/Infrastructure/Persistence/Migrations` | `Skills.Infrastructure.Persistence.Migrations` |
| System | `SystemDbContext` | `src/System/Infrastructure/Persistence/Migrations` | `SystemContext.Infrastructure.Persistence.Migrations` |
| Media | `MediaDbContext` | `src/Media/Infrastructure/Persistence/Migrations` | `MediaContext.Infrastructure.Persistence.Migrations` |
| Voice | `VoiceDbContext` | `src/Voice/Infrastructure/Persistence/Migrations` | `Voice.Infrastructure.Persistence.Migrations` |
| Motion | `MotionDbContext` | `src/Motion/Infrastructure/Persistence/Migrations` | `MotionContext.Infrastructure.Persistence.Migrations` |
| Production | `ProductionDbContext` | `src/Production/Infrastructure/Persistence/Migrations` | `ProductionContext.Infrastructure.Persistence.Migrations` |
| Research | `ResearchDbContext` | `src/Research/Infrastructure/Persistence/Migrations` | `Research.Infrastructure.Persistence.Migrations` |

Пример (изменили модель Voice):

```powershell
cd backend2
dotnet ef migrations add AddVoiceGender --context VoiceDbContext `
  --output-dir src/Voice/Infrastructure/Persistence/Migrations `
  --namespace Voice.Infrastructure.Persistence.Migrations `
  --configuration Release

dotnet run -- --migrate
```

> `dotnet ef` кладёт `*ModelSnapshot.cs` по пути из `--namespace`. Во всех текущих каталогах snapshot уже лежит рядом с миграциями — просто проверьте, что новый файл появился в том же каталоге.

### 2.4. Проверка состояния

```powershell
cd backend2

# Список миграций контекста и признак применения (Pending/Applied)
dotnet ef migrations list -c VoiceDbContext --configuration Release

# Модель не разошлась со snapshot (должно быть "No changes ...")
dotnet ef migrations has-pending-model-changes -c VoiceDbContext --configuration Release

# SQL, который будет применён (без выполнения)
dotnet ef migrations script -c VoiceDbContext -o migration.sql --configuration Release
```

### 2.5. Откат и удаление

```powershell
# Откатить БД к предыдущей миграции
dotnet ef database update <PreviousMigrationId> -c VoiceDbContext --configuration Release

# Удалить последнюю (неприменённую) миграцию из кода
dotnet ef migrations remove -c VoiceDbContext --configuration Release
```

Если миграция уже применена к БД, `migrations remove` откажется работать — сначала верните схему через `database update`.

### 2.6. Пересоздание БД с нуля (⚠️ потеря данных)

```powershell
cd backend2
# server должен быть остановлен
Remove-Item data_storage\voice.db -Force
dotnet run -- --migrate
```

### 2.7. Бэкап перед миграцией

```powershell
$backup = "..\_db-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory $backup | Out-Null
Copy-Item data_storage\*.db* $backup -Force
```

## 3. Запуск бэкенда

```powershell
cd backend2
dotnet run --launch-profile http        # http://localhost:5116
```

Профили (`backend2/Properties/launchSettings.json`):

| Профиль | URL |
|---|---|
| `http` | `http://localhost:5116` |
| `https` | `https://localhost:7258;http://localhost:5116` |

Проверка: `GET /health`, `GET /api/health`, `GET /` (JSON `{ service, status }`). WebSocket — `ws://localhost:5116/ws/events/{clientId}`.

Через фронтенд:

```powershell
cd frontend
pnpm backend:dev        # dotnet run --launch-profile http
pnpm dev:all            # backend2 + Vite одновременно
```

> **Важно.** Пока backend2 запущен, он блокирует `backend2/bin/Debug` — сборка и тесты в Debug упадут с `MSB3021`/`MSB3027`. Остановите сервер (Ctrl+C) либо собирайте с `-c Release`.
>
> `stop-dev.ps1` НЕ останавливает backend2: в нём порты `8355, 5173, 11434`. Backend2 останавливается через Ctrl+C.

## 4. Тесты

```powershell
# Юнит/интеграционные тесты ядра и контекстов
dotnet test backend2/tests/Kernel.Tests

# Архитектурный DDD-линтер (NetArchTest, strict)
dotnet test backend2/tests/Architecture.Tests -c Release

# Один класс/тест
dotnet test backend2/tests/Kernel.Tests --filter "FullyQualifiedName~MediaTests"

# Перечислить тесты без запуска
dotnet test backend2/tests/Architecture.Tests -c Release --list-tests
```

| Проект | Что проверяет |
|---|---|
| `backend2/tests/Kernel.Tests` | xUnit: песочница путей, GPU-лок, шина событий, супервизор процессов, middleware, интеграции YouTube/Whisper |
| `backend2/tests/Architecture.Tests` | Правила DDD / Clean Architecture `DDD001`–`DDD010`: чистота `Domain`, направление слоёв, изоляция bounded context'ов, порты, VO, имена событий |

Замечания:

- `Kernel.Tests` включает тесты, требующие нативных библиотек, CUDA и сети — при необходимости фильтруйте.
- `Architecture.Tests` — строгий режим (без baseline). Текущее состояние: 72 из 94 проходят; остальные падают на реальных нарушениях, их нужно починить.
- Если backend2 запущен, для тестов используйте `-c Release` либо остановите сервер.
- Python-линтер DDD (для Python-кода, не для backend2): `python ddd_guard.py <каталог>`.

## 5. Python TTS-воркер (опционально)

```powershell
cd python_services\tts_engine
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python main.py          # http://127.0.0.1:8000
```

Бэкенд обращается к воркеру по адресу `Integrations:LocalTts:BaseUrl` (`backend2/appsettings.json`, по умолчанию `http://127.0.0.1:8000`). Подробности — `python_services/tts_engine/README.md`.

## 6. Фронтенд (опционально)

```powershell
cd frontend
pnpm dev                # Vite, :5173
pnpm dev:all            # backend2 (:5116) + Vite (:5173)
```

Переменные окружения: скопируйте `.env.example` в `frontend/.env` (Vite читает env из каталога `frontend`). Единственная используемая переменная — `VITE_API_URL` (по умолчанию `http://localhost:5116`).

## 7. Быстрый чек-лист первого запуска

1. `cd backend2; dotnet restore`
2. `dotnet run -- --migrate`
3. `dotnet run --launch-profile http`
4. (опц.) в отдельном терминале — Python TTS-воркер
5. `cd frontend; pnpm dev:all`
6. Тесты: `dotnet test backend2/tests/Kernel.Tests` и `dotnet test backend2/tests/Architecture.Tests -c Release`

## 8. Траблшутинг

| Симптом | Причина | Решение |
|---|---|---|
| `MSB3021`/`MSB3027`: файл занят `backend2.dll`/`backend2.exe` | запущен backend2 | Ctrl+C, либо `dotnet test -c Release` |
| `SQLite Error 1: table ... already exists` | легаси-БД без `__EFMigrationsHistory`, baseline не сработал | проверить лог `[MigrationShim]`; при необходимости — `dotnet run -- --migrate` на существующей БД |
| Миграция не применяется, таблиц нет | не выполнен `--migrate` | `dotnet run -- --migrate` |
| `dotnet ef` не найден | не установлен CLI | `dotnet tool install --global dotnet-ef --version 9.0.2` |
| `migrations remove` не работает | миграция уже применена к БД | откатить `dotnet ef database update <prev> -c <Context>` |
| `has-pending-model-changes` сообщает об изменениях | модель разошлась со snapshot | создать миграцию по §2.3 |
| `dotnet test` в корне ничего не находит | нет `.sln` | указывайте путь к проекту явно |
| Порт `5116` занят | уже запущен другой экземпляр | завершить процесс или сменить `applicationUrl` профиля |
| Фронтенд не видит backend | другой `VITE_API_URL` | проверить `frontend/.env` |

## 9. OpenAPI и End-to-End типизация

Бэкенд отдаёт Swagger UI — `http://localhost:5116/swagger` — и спецификацию `http://localhost:5116/swagger/v1/swagger.json` (Swashbuckle.AspNetCore).

### 9.1. Генерация типов

Бэкенд должен быть запущен (`dotnet run --launch-profile http`), затем:

```powershell
cd frontend
pnpm api:generate
```

Скрипт скачивает `swagger.json` и перезаписывает `frontend/src/shared/api/schema.d.ts`. Выполнять после добавления/изменения роутов в `Api/Endpoints/*.cs`.

### 9.2. Использование клиента

Весь HTTP во фронтенде идёт через `openapi-fetch` (axios удалён). Единственное исключение — NDJSON-стрим `/api/v1/youtube/agent/stream`, где нужен `ReadableStream` (оставлен нативный `fetch`).

- Vanilla / Zustand / хуки: `import { fetchClient, apiErrorMessage } from '@shared/api'`.
- React-компоненты: `import { $api } from '@shared/api'` → `const { data, isLoading } = $api.useQuery('get', '/api/v1/system/status')`.

Импорт всегда через публичный API слоя (`@shared/api`); прямой `@shared/api/client` FSD-линтер (`fsd/no-public-api-sidestep`) запрещает.

### 9.3. Обработка ошибок

`openapi-fetch`, в отличие от axios, **не бросает** исключение на non-2xx, а возвращает `{ data, error }`. Чтобы сохранить throw-семантику в существующих `try/catch`, используйте единый паттерн:

```ts
const { data, error } = await fetchClient.POST('/api/v1/audio/generate', { body })
if (error || data === undefined) throw new Error(apiErrorMessage(error))
```

`apiErrorMessage(error)` достаёт человекочитаемый текст из `detail`/`message`/`error`.

### 9.4. Точная типизация ответов

`data` типизируется точно там, где эндпоинт объявлен с `.Produces<...>()`. Размечены все операции, возвращающие тело, включая бинарные стримы (file/SSE/NDJSON — как `byte[]`/`string` с соответствующим `contentType`). Response-схемы нет только у `204 No Content` (тела нет по определению) и у исключённого из документации WebSocket-роута `/ws/events/{clientId}`. При добавлении новых роутов сразу указывайте `.Produces<Dto>()`, иначе `data` будет `unknown`.
