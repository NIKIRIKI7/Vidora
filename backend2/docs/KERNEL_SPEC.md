# Kernel backend2 (.NET) — спецификация

> Область: `backend2/src/Kernel/**` + `backend2/src/Api/Common/Middleware/**` (глобальный перехватчик).
> Статус: Этап 1 и база Этапа 3 реализованы (ядро + JSONL-телеметрия + YouTube Integration + 71 тестов в решении). Статусы ниже помечены `[реализовано]` / `[заглушка: Этап 3]`.
> Что это: общий технический базис модульного монолита Vidora. **Здесь нет бизнес-инвариантов** — это платформа, которую могут импортировать все BC, но сам Kernel никого из приложения не импортирует.

---

## 1. Назначение

Kernel предоставляет то, что повторяется в каждом Bounded Context и не относится к домену:

1. Доменные исключения + единый JSON-конверт ошибок.
2. In-process шину доменных событий с Dead-Letter очередью.
3. Песочницу файловых путей (анти Path Traversal).
4. Супервизор дочерних процессов (Windows Job Object).
5. Арбитр VRAM/GPU.
6. WebSocket-шлюз прогресса.
7. Порты к внешним системам (LLM/FFmpeg/Remotion) — интерфейсы для Этапа 3.
8. Структурированное JSONL-логирование.

---

## 2. Модули и ответственность

| Модуль | Ключевые типы | Что делает | Статус |
|---|---|---|---|
| `Kernel.Exceptions` | `DomainException`, `DomainConflictException`, `ResourceNotFoundException`, `SecurityPathViolationException`, `ValidationException`, `ErrorEnvelope` | Типизированные ошибки с `ErrorCode`/`StatusCode`/`Details`; единый конверт ответа; 409 Conflict на коллизии инвариантов | [реализовано] |
| `Kernel.Events` | `IDomainEvent`, `DomainEvent`, `IEventBus`, `IDomainEventHandler<T>`, `InMemoryEventBus`, `DomainEventDispatcherHostedService`, `InMemoryDeadLetterQueue`, `IEventDeadLetterQueue`, `DeadLetterEntry` | SRP: `InMemoryEventBus` — тонкий фасад публикации (bounded Channel); фоновую доставку ведёт `DomainEventDispatcherHostedService` (кэш скомпилированных invoker'ов, без рефлексии в горячем цикле); сбои обработчиков — в отдельную `InMemoryDeadLetterQueue` (≤500) | [реализовано] |
| `Kernel.Platform.FileSystem` | `IPathResolver`, `PathResolver` | Разрешение путей строго внутри `allowed_roots`; разыменование symlink/junction; санитизация имён файлов | [реализовано] |
| `Kernel.Platform.Process` | `IProcessSupervisor`, `ProcessSupervisor`, `ProcessExecutionResult` | Запуск CLI с захватом stdout/stderr; Windows Job Object `KILL_ON_JOB_CLOSE`; привязка «чужих» процессов; kill дерева при отмене | [реализовано] |
| `Kernel.Platform.Gpu` | `IGpuManager`, `GpuManager` | Двухуровневый лок: `SemaphoreSlim` (внутри процесса) + файл (`%TEMP%\vidora_gpu_vram.lock`, `DeleteOnClose`) — против OOM между воркерами и Chromium | [реализовано] |
| `Kernel.Platform.WebSockets` | `IWebSocketGateway`, `WebSocketGateway` | Рассылка `{event, data, timestamp}` всем клиентам; **per-client send-lock** (WebSocket запрещает параллельный `SendAsync`); закрытие при переподключении | [реализовано] |
| `Kernel.Ports` | `ILlmClient`, `IFfmpegClient`, `IRemotionRunner` + records | Абстракции внешних систем для BC | [заглушка: Этап 3] |
| `Kernel.Platform.Logging` | `JsonLinesFileLogger(Provider)`, `AddJsonLinesFile()` | NDJSON в `data_storage/app_events.jsonl`; async flush через Channel; гарантия сброса при остановке | [реализовано] |
| `Api.Common.Middleware` | `ExceptionHandlingMiddleware` | Маппинг `DomainException`→HTTP-код + `ErrorEnvelope`; 499 на обрыв клиента; 500 без утечки деталей в проде | [реализовано] |

---

## 3. Что Kernel НЕ делает (границы)

- Не хранит бизнес-данные (нет БД, нет таблиц) — владение данными закреплено за BC.
- Не знает о конкретных BC и не реализует их сценарии.
- Порты `ILlmClient`/`IFfmpegClient`/`IRemotionRunner` **не имеют реализаций** — они появятся в `Integrations/` на Этапе 3. До этого их нельзя запрашивать из DI.
- Не содержит HTTP-эндпоинтов: эндпоинты — зона `Api/`.

---

## 4. Регистрация и подключение

Единая точка — `Kernel.KernelServiceExtensions.AddKernelServices`.

```csharp
using Kernel;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddKernelServices(builder.Configuration, builder.Logging);
```

`Program.cs` (уже так):
```csharp
app.UseMiddleware<ExceptionHandlingMiddleware>();
app.UseWebSockets();
```

Что регистрируется внутри:
- `IPathResolver` — singleton; корни из `Storage:AllowedRoots` (пустые фильтруются), иначе `CWD`.
- `IProcessSupervisor` → `ProcessSupervisor` — singleton.
- `IGpuManager` → `GpuManager` — singleton.
- `IWebSocketGateway` → `WebSocketGateway` — singleton.
- `InMemoryEventBus` — singleton + как `IEventBus` (bounded Channel 10k, backpressure `Wait`).
- `InMemoryDeadLetterQueue` — singleton + как `IEventDeadLetterQueue`.
- `DomainEventDispatcherHostedService` — фоновый диспетчер (hosted-service), читает канал шины.
- JSONL-логгер в `data_storage/app_events.jsonl`.

Конфиг песочницы (`appsettings.json`):
```json
{
  "Storage": {
    "AllowedRoots": [ "C:\\Projects\\Vidora\\backend2" ]
  }
}
```

> Правило DI: BC-код запрашивает **интерфейсы** (`IPathResolver`, `IEventBus`, …), а не конкретные классы. Прямые ссылки на `PathResolver`/`ProcessSupervisor` допустимы только в композиции и тестах.

---

## 5. Как работать с компонентами

### 5.1 Исключения

Кидай доменные исключения в use case/домене; middleware сам маппит в ответ:

| Исключение | HTTP | `error_code` |
|---|---|---|
| `ResourceNotFoundException` | 404 | `RESOURCE_NOT_FOUND` |
| `DomainConflictException` | 409 | `DOMAIN_CONFLICT` (или кастомный код: `CANNOT_DELETE_DEFAULT_SKILL`, `SETTING_READONLY` и т.д.) |
| `SecurityPathViolationException` | 403 | `SECURITY_PATH_VIOLATION` |
| `ValidationException` | 422 | `VALIDATION_FAILED` |
| свой подкласс `DomainException` | `ex.StatusCode` | `ex.ErrorCode` |
| внутр. таймаут/отмена (`OperationCanceledException`, клиент не рвал) | 504 | `REQUEST_TIMEOUT` |
| клиент оборвал соединение (`RequestAborted`) | — | не пишем ответ, только лог |
| необработанное | 500 | `INTERNAL_SERVER_ERROR` |

```csharp
throw new ResourceNotFoundException("Scene", sceneId);
throw new ValidationException("scene_id", "Сцена не может быть пустой.");
```

Формат ответа (совместим с FastAPI-клиентом):
```json
{ "status": "error", "error_code": "RESOURCE_NOT_FOUND",
  "detail": "Ресурс 'Scene' с идентификатором 'scene-01' не найден.",
  "details": { "ResourceName": "Scene", "ResourceId": "scene-01" },
  "timestamp": "..." }
```

### 5.2 Шина событий

```csharp
// 1. Событие
public sealed record SceneVoiced(string AggregateId, string VoiceAssetId) : DomainEvent(AggregateId);

// 2. Обработчик — регистрируется в DI как transient
public sealed class SceneVoicedHandler : IDomainEventHandler<SceneVoiced>
{
    public Task HandleAsync(SceneVoiced e, CancellationToken ct) { ... }
}
// services.AddTransient<IDomainEventHandler<SceneVoiced>, SceneVoicedHandler>();

// 3. Публикация
var bus = sp.GetRequiredService<IEventBus>();
await bus.PublishAsync(new SceneVoiced("project/1", voiceAssetId), ct);
```

Поведение:
- Доставка асинхронная, в фоне (отдельный hosted-сервис). Обработчики одного события выполняются последовательно.
- Вызов обработчика — через закэшированный скомпилированный делегат (без `MethodInfo.Invoke` в горячем цикле); оригинальное исключение не заворачивается в `TargetInvocationException`.
- Исключение в обработчике **не роняет шину**: логируется `LogCritical`, событие попадает в отдельную `InMemoryDeadLetterQueue` (хранится до 500 записей), следующий обработчик продолжает.
- Обработчики создаются в отдельном scope (могут использовать scoped-зависимости).
- Смотреть упавшие: `GET /api/v1/system/dead-letters`.

### 5.3 Песочница путей

```csharp
var fs = sp.GetRequiredService<IPathResolver>();
string safe = fs.ResolveSafePath(userInputPath);   // SecurityPathViolationException при выходе за корни
bool ok = fs.IsSafePath(possiblePath);
string name = fs.SanitizeFileName(raw);            // не вернёт пустую строку
```

Учитывает: `..`, абсолютные пути вне корней, symlink/junction (разыменовывает реальную цель). Корни задаются конфигом (см. §4).

### 5.4 Запуск дочерних процессов

```csharp
var ps = sp.GetRequiredService<IProcessSupervisor>();
var res = await ps.RunAsync(
    "ffmpeg", "-i in.mp4 out.mp4",
    workingDirectory: projDir,
    onStdOut: line => ...,
    cancellationToken: ct);
// res.ExitCode / res.StandardOutput / res.StandardError
```

- На Windows каждый запуск привязывается к Job Object: при аварийном падении хоста или вызове `Dispose` дочерние процессы убиваются ОС (нет сирот).
- При отмене `ct` — дерево процессов принудительно завершается, наружу уходит `OperationCanceledException`/`TaskCanceledException`.
- Уже запущенный процесс можно взять под надзор: `ps.TrackProcess(proc)` — при провале привязки кидает `InvalidOperationException` (не молчит).
- Процессы не стартуют через shell (`UseShellExecute=false`); аргументы передаются строкой — не вставляй пользовательский ввод в команду без экранирования.

### 5.5 GPU/VRAM

```csharp
var gpu = sp.GetRequiredService<IGpuManager>();
await using (await gpu.AcquireGpuLockAsync("voice-tts", ct))
{
    // тяжёлая модель / вывод VRAM — никто параллельно не полезет
}
await gpu.CleanMemoryAsync(ct); // принудительный GC перед Chromium
```

Лок не «фантомный»: отмена во время ожидания всегда выбрасывает исключение и освобождает семафор; файловый лок автоматически удаляется при закрытии.

### 5.6 WebSocket-шлюз

```csharp
var ws = sp.GetRequiredService<IWebSocketGateway>();
await ws.RegisterClientAsync(clientId, webSocket);     // на приёме /ws/events/{clientId}
await ws.BroadcastAsync("RENDER_PROGRESS", new { taskId, progress = 45 });
await ws.UnregisterClientAsync(clientId);               // при дисконнекте
```

Конверт в сокет: `{ "event": "RENDER_PROGRESS", "data": {...}, "timestamp": "..." }`.
Отправка на одно соединение сериализована локом; мёртвые клиенты отключаются и удаляются. `RegisterClientAsync` с тем же `clientId` закрывает старое соединение.

### 5.7 Порты для Этапа 3

Интерфейсы объявлены, реализаций нет:
- `ILlmClient` — `GenerateTextAsync`, `GenerateJsonAsync<T>`, `StreamTextAsync` (спека `LlmPromptSpec`: messages, temperature, maxTokens, jsonMode).
- `IFfmpegClient` — `ProbeAsync` (`MediaProbeResult`), `ExecuteAsync`.
- `IRemotionRunner` — `RenderAsync(spec, IProgress<RemotionProgress>)`.

Контракты в `Kernel.Ports` — менять сигнатуры до Этапа 3 можно безболезненно; после — дорого.

### 5.8 Логирование

Включается автоматически в `AddKernelServices`. Формат строки (NDJSON):

```json
{ "timestamp": "...", "level": "INFORMATION", "category": "Kernel.Events.InMemoryEventBus",
  "event_id": 0, "message": "[EventBus] ...", "exception": null }
```

- Файл: `<CWD>/data_storage/app_events.jsonl`, **дописывается** между запусками (Append).
- Канал лога bounded (20k, `DropOldest`) — при задержке диска роняются старые строки, а не память процесса.
- Поток лога не блокирует бизнес-код; при остановке буфер дожимается на диск (`Dispose` — с таймаутом 5 c).
- Свой логгер добавлять не нужно — используй стандартный `ILogger<T>` из DI.

---

## 6. Проверка корректности

### Тесты (71 шт., xUnit)

```powershell
# из корня репозитория:
dotnet test backend2/tests/Kernel.Tests/Kernel.Tests.csproj
# или из backend2\src:
dotnet test ..\tests\Kernel.Tests\Kernel.Tests.csproj
```

Покрытие:
- `PathResolverTests` — легитимные пути, path traversal (`../..`), санитизация имён (вкл. кириллицу и зарезервированные устройства Windows `CON`/`AUX`/`NUL`/`COM*`).
- `GpuManagerTests` — захват/освобождение (уникальный лок-файл на тестовый класс); отмена не оставляет «фантомный» лок.
- `EventBusTests` — доставка события; падение обработчика → запись в DLQ без потери оригинального исключения. Ожидание через `TaskCompletionSource` (без spin-wait).
- `ProcessSupervisorTests` — успешный запуск CLI; отмена убивает дерево и пробрасывает отмену.
- `ExceptionHandlingMiddlewareTests` — 404 + `ErrorEnvelope`, 500 без утечки деталей в проде и с деталями в dev, клиентский обрыв без записи ответа, внутренний таймаут → 504.
- `YouTubeIntegrationTests` — парсинг метаданных `ytscrape`, обработка ошибок CLI, проброс `OperationCanceledException` без маскировки в 502, изоляция тестов в `%TEMP%`.

### Ручной smoke

```powershell
$env:ASPNETCORE_URLS="http://127.0.0.1:5117"
dotnet run --project backend2

# ожидаемо:
#   GET /health                    -> 200 {"status":"healthy"}
#   GET /api/v1/system/dead-letters-> 200 []
#   GET /no-such-route             -> 404
```

Признаки корректной работы:
- растёт `backend2/data_storage/app_events.jsonl` валидными JSON-строками (в т.ч. `[EventBus] Диспетчер...`, `[Песочница] Зарегистрирован...`);
- выход за `AllowedRoots` → 403 и запись `[Песочница] АТАКА PATH TRAVERSAL`;
- остановка приложения (Ctrl+C) не теряет строки лога (проверь, что последняя строка дописана).

---

## 7. Конвенции для разработчика

1. Новый код ядра — только в `Kernel/**` или как адаптер в `Integrations/**`; бизнес-код BC не может импортировать внутренности другого BC.
2. Исключения — только через иерархию `DomainException`; голые `throw new Exception` в use case запрещены.
3. Нет пустых `catch`. Ошибки логируются через `ILogger`; исключения либо пробрасываются, либо явно обрабатываются.
4. Long-running операции должны уважать `CancellationToken` и публиковать прогресс через `IWebSocketGateway`.
5. Никаких общих мутабельных синглтонов между BC — только зарегистрированные в DI службы Kernel.
6. Менять файл `backend2.csproj` нельзя так, чтобы `tests/**` снова попал в компиляцию веб-приложения (`DefaultItemExcludes` обязателен).
7. Внешние CLI-инструменты (`python`/`yt-dlp`): отмена токеном вызывающей стороны обязана пробрасывать `OperationCanceledException` без оборачивания в `DomainException`, чтобы Middleware мог отличить таймаут от намеренного обрыва соединения клиентом.
