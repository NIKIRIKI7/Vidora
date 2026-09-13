using Microsoft.OpenApi;
using Swashbuckle.AspNetCore.SwaggerGen;
using System.Text.Json.Nodes;

namespace Api.OpenApi;

/// <summary>
/// Документация одной конечной точки: краткая суть, подробное описание,
/// входные и выходные данные. Применяется operation-фильтром Swagger.
/// </summary>
public sealed record ApiEndpointDoc(string Summary, string Description, string Input, string Output);

/// <summary>
/// Централизованные описания всех публичных API для Swagger UI.
/// Ключ — "МЕТОД /относительный/путь" (с шаблонами вида {id}).
/// Держим их отдельно от кода эндпоинтов, чтобы не дублировать атрибуты на каждой лямбде.
/// </summary>
public static class ApiDocumentation
{
    public static readonly IReadOnlyDictionary<string, string> ParameterDescriptions =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = "Уникальный идентификатор ресурса.",
            ["projectId"] = "Идентификатор проекта (slug/имя проекта).",
            ["project_id"] = "Идентификатор проекта.",
            ["sceneId"] = "Идентификатор сцены внутри проекта.",
            ["scene_id"] = "Идентификатор сцены.",
            ["videoId"] = "Идентификатор YouTube-видео (11-символьный ID или URL).",
            ["jobId"] = "Идентификатор задачи (рендер/TTS).",
            ["modelId"] = "Идентификатор модели (например, gemma3:4b или diarization-модель).",
            ["key"] = "Ключ настройки системы.",
            ["revision"] = "Номер ревизии кода сцены (целое число).",
            ["revisionId"] = "Номер ревизии кода сцены (целое число).",
            ["stage"] = "Стадия пайплайна: ScenarioDrafting, SceneCodeGeneration, BRollMatching, TtsVoice, HookAnalysis и др.",
            ["page"] = "Номер страницы (с 1).",
            ["pageSize"] = "Размер страницы.",
            ["perPage"] = "Количество элементов на странице.",
            ["type"] = "Фильтр типа медиа: Video, Audio, Image.",
            ["query"] = "Поисковый запрос.",
            ["orientation"] = "Ориентация видео: landscape или portrait.",
            ["mood"] = "Фильтр музыкального каталога по настроению.",
            ["role"] = "Роль модели в пайплайне (ModelTaskRole).",
            ["limit"] = "Максимальное количество записей.",
            ["level"] = "Фильтр уровня логов: Information, Warning, Error.",
            ["maxComments"] = "Максимум комментариев к загрузке (1–100).",
            ["path"] = "Путь к файлу (абсолютный или относительно data_storage/проекта).",
            ["max_tokens"] = "Лимит токенов для бандла скилов.",
            ["custom_header"] = "Дополнительные инструкции в заголовке системного промпта.",
            ["only_enabled"] = "true — вернуть только включённые скилы.",
        };

    /// <summary>
    /// Описания свойств схем (полей request/response body) по JSON-имени поля.
    /// Применяются <see cref="ApiPropertyDocumentationSchemaFilter"/>.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> PropertyDescriptions =
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            // Идентификация
            ["id"] = "Уникальный идентификатор.",
            ["name"] = "Человекочитаемое имя.",
            ["description"] = "Текстовое описание.",
            ["title"] = "Заголовок.",
            ["project_id"] = "Идентификатор проекта.",
            ["project_path"] = "Путь проекта внутри хранилища (обычно имя проекта).",
            ["scene_id"] = "Идентификатор сцены.",
            ["fragment_id"] = "Идентификатор фрагмента.",
            ["video_id"] = "Идентификатор YouTube-видео.",
            ["target_id"] = "Идентификатор цели операции (сцена/фрагмент).",
            ["target"] = "Тип цели операции (например, scene).",

            // Текст и кодинг
            ["text"] = "Текст для синтеза речи.",
            ["prompt"] = "Текст промпта для LLM.",
            ["code"] = "Исходный TSX-код сцены.",
            ["tsx_code"] = "Исходный TSX-код сцены.",
            ["markdown"] = "Markdown-сценарий.",
            ["visual_description"] = "Описание кадра/сцены для генерации кода.",
            ["visual_note"] = "Визуальная ремарка фрагмента (например, B-roll/архетип).",
            ["voice_text"] = "Текст озвучки фрагмента.",
            ["command"] = "Команда для ИИ-копилота (например, «короче», «кликбейтнее»).",
            ["include_trend_context"] = "Учитывать ли тренд-контекст при рерайте.",
            ["custom_prompt"] = "Дополнительный пользовательский промпт.",

            // TTS / Voice
            ["speaker_id"] = "Идентификатор диктора (speaker_id профиля).",
            ["engine"] = "Движок: LocalTts, CloudOpenAi, CloudMiniMax.",
            ["speed"] = "Скорость речи (0.2–4.0).",
            ["pitch"] = "Высота тона (0.5–2.0).",
            ["guidance_scale"] = "CFG-масштаб диффузии (1.0–10.0).",
            ["num_steps"] = "Число шагов диффузии (8–128).",
            ["alignment_engine"] = "Движок выравнивания: Whisper, NativeTts, Passthrough.",
            ["reference_audio_path"] = "Путь к референсному аудио.",
            ["reference_text"] = "Текст, звучащий в референсном аудио.",
            ["local_engine_id"] = "ID локального движка-воркера (например, omni_voice_v1).",
            ["duration"] = "Длительность, сек.",
            ["language"] = "Язык (например, ru).",

            // Аудио-обработка
            ["audio_path"] = "Путь к аудиофайлу.",
            ["audio_paths"] = "Список путей к аудиофайлам.",
            ["output_path"] = "Путь к выходному файлу.",
            ["action"] = "Действие DSP: lavasr, mastering, silence.",
            ["threshold_db"] = "Порог тишины в дБ.",
            ["min_silence_ms"] = "Минимальная длительность паузы, мс.",
            ["max_silence_ms"] = "Максимальная длительность паузы, мс.",
            ["remove_edges"] = "Удалять тишину по краям.",
            ["voice_asset_id"] = "ID аудио-ассета голоса.",
            ["bgm_asset_id"] = "ID аудио-ассета фоновой музыки.",
            ["music_attenuation_db"] = "Ослабление музыки под голосом, дБ.",
            ["attack_ms"] = "Время атаки дакинга, мс.",
            ["release_ms"] = "Время восстановления дакинга, мс.",

            // Видео / композиция
            ["width"] = "Ширина, пиксели.",
            ["height"] = "Высота, пиксели.",
            ["fps"] = "Кадров в секунду.",
            ["duration_seconds"] = "Длительность, секунды.",
            ["duration_in_frames"] = "Длительность, кадры.",
            ["montage_settings"] = "Настройки монтажа (разрешение, FPS, цвета).",
            ["capabilities"] = "Разрешённые пакеты/возможности сцены.",
            ["render_quality"] = "Качество рендера: low, medium, high.",
            ["background_music"] = "Настройки фоновой музыки и дакинга.",
            ["broll_sources"] = "Список B-Roll-файлов для сцены.",
            ["video_paths"] = "Список путей к видео сцен.",
            ["download_url"] = "Прямая ссылка на скачивание.",
            ["source_path"] = "Путь к исходному файлу.",
            ["target_format"] = "Целевой формат (16:9 / 9:16).",
            ["target_resolution"] = "Целевое разрешение.",
            ["fit_mode"] = "Режим вписывания: cover, contain.",
            ["loop_if_shorter"] = "Зациклить, если короче целевой длительности.",
            ["keep_audio"] = "Сохранить исходную аудиодорожку.",
            ["extract_audio"] = "Извлечь аудио из видео.",
            ["filename"] = "Имя файла.",
            ["folder"] = "Целевая папка.",
            ["url"] = "URL ресурса.",
            ["project_data"] = "Полный слепок проекта (сквозной payload).",

            // Стоки / медиа
            ["type"] = "Тип медиа: Video, Audio, Image.",
            ["query"] = "Поисковый запрос.",
            ["orientation"] = "Ориентация: landscape или portrait.",
            ["mood"] = "Настроение трека.",
            ["page"] = "Номер страницы (с 1).",
            ["pageSize"] = "Размер страницы.",
            ["per_page"] = "Элементов на странице.",

            // Research / YouTube
            ["niche"] = "Ниша/тематика канала.",
            ["url_or_name"] = "URL или имя канала.",
            ["youtube_key"] = "API-ключ YouTube Data API.",
            ["transcript"] = "Транскрипт вступления видео.",
            ["video_url"] = "URL видео.",
            ["idea_description"] = "Описание идеи видео.",
            ["channel_context"] = "Контекст канала.",
            ["video_type"] = "Тип видео: short / long / all.",
            ["audio_engine"] = "Движок озвучки для сценария.",
            ["settings"] = "Настройки поиска/агента.",
            ["exclude_video_ids"] = "Исключаемые видео.",
            ["llm_engine"] = "Движок LLM.",
            ["days_back"] = "Глубина поиска в днях (0 — без ограничения по дате).",
            ["min_subs"] = "Минимум подписчиков у канала.",
            ["max_subs"] = "Максимум подписчиков у канала.",
            ["min_ratio"] = "Минимальное отношение просмотров к подписчикам.",
            ["search_mode"] = "Режим поиска: trending | search | channels.",
            ["search_engine"] = "Движок поиска: auto | youtube | google.",
            ["ideas_count"] = "Сколько контент-идей сгенерировать.",
            ["channels"] = "Список каналов-конкурентов (@handle или UC-id).",
            ["exclude_queries"] = "Исключаемые поисковые запросы.",
            ["is_expand_search"] = "Расширять ли поиск смежными запросами.",
            ["target_duration"] = "Целевая длительность видео в минутах.",
            ["elevenlabs"] = "API-ключ ElevenLabs.",
            ["anthropic"] = "API-ключ Anthropic.",
            ["openai"] = "API-ключ OpenAI.",
            ["routerai"] = "API-ключ RouterAI.",
            ["aitunnel"] = "API-ключ AITunnel.",
            ["youtube"] = "API-ключ YouTube Data API.",
            ["pexels"] = "API-ключ Pexels.",

            // Настройки / навыки
            ["key"] = "Ключ настройки.",
            ["value"] = "Новое значение настройки.",
            ["stage"] = "Стадия пайплайна.",
            ["content"] = "Содержимое скила (промпт).",
            ["priority"] = "Приоритет применения (чем больше, тем выше).",
            ["is_enabled"] = "Включён ли скил.",
            ["tags"] = "Теги.",
            ["api_keys"] = "Набор API-ключей провайдеров.",
            ["role"] = "Роль модели в пайплайне.",

            // Прочие частые поля
            ["status"] = "Статус операции.",
            ["message"] = "Текстовое сообщение.",
            ["task_id"] = "Идентификатор фоновой задачи.",
            ["error_code"] = "Код ошибки.",
            ["error"] = "Текст ошибки.",
            ["detail"] = "Детали ошибки.",
            ["audio_url"] = "Имя сгенерированного аудиофайла.",
            ["processed_audio_path"] = "Путь к обработанному аудио.",
            ["new_duration_sec"] = "Новая длительность после обработки, сек.",
            ["denoise"] = "Применять шумоподавление.",
            ["preprocess_prompt"] = "Предобрабатывать промпт перед синтезом.",
            ["postprocess_output"] = "Постобрабатывать результат синтеза.",
            ["filters"] = "Набор аудио-фильтров (LUFS, тишина).",
            ["steps"] = "Число шагов диффузии.",
            ["version"] = "Версия.",
            ["is_default"] = "Является ли запись системной по умолчанию.",
            ["estimated_tokens"] = "Оценка числа токенов.",
            ["updated_at"] = "Дата последнего обновления.",
            ["created_at"] = "Дата создания.",
        };


    /// <summary>
    /// Примеры тела запроса по простому имени CLR-типа (request DTO).
    /// Подставляются в схему Swagger, чтобы «Try it out» был сразу готов к запуску.
    /// </summary>
    public static readonly IReadOnlyDictionary<string, string> RequestExamples =
        new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["MoreVideosRequest"] =
                """{"query":"ai productivity tools","language":"en","settings":{"days_back":30,"min_subs":1000,"max_subs":90000,"min_ratio":1.5,"search_mode":"trending","search_engine":"auto","language":"en","video_type":"all","ideas_count":5,"is_expand_search":false}}""",
            ["DownloadMetaRequest"] =
                """{"url":"https://www.youtube.com/watch?v=jNQXAC9IVRw","project_path":"my-project"}""",
            ["AnalyzeHookRequest"] =
                """{"video_id":"Lf5oqGOCRCM","language":"en"}""",
            ["AnalyzeChannelRequest"] =
                """{"url_or_name":"https://www.youtube.com/@MrBeast","language":"en"}""",
            ["SuggestCompetitorsRequest"] =
                """{"niche":"AI productivity tools","language":"en"}""",
            ["DraftScriptRequest"] =
                """{"title":"Why AI changes everything","idea_description":"A deep dive into AI economics","video_type":"long","target_duration":"3","language":"en"}""",
            ["StreamAgentRequest"] =
                """{"query":"ai tools","project_path":"my-project","settings":{"days_back":30,"min_subs":1000,"max_subs":90000,"min_ratio":1.5,"search_mode":"trending","search_engine":"auto","language":"en","video_type":"all","ideas_count":5,"is_expand_search":false}}""",
        };

    public static readonly IReadOnlyDictionary<string, ApiEndpointDoc> Endpoints =
        new Dictionary<string, ApiEndpointDoc>(StringComparer.OrdinalIgnoreCase)
        {
            // ─────────────────────────────── Media ───────────────────────────────
            ["GET /api/v1/media"] = new(
                "Список медиа-ассетов",
                "Постранично возвращает загруженные ассеты (видео/аудио/изображения) с необязательным фильтром по типу.",
                "query: type, page, pageSize",
                "PagedResult<MediaAssetDto>"),
            ["GET /api/v1/media/{id}"] = new(
                "Медиа-ассет по ID",
                "Возвращает метаданные одного ассета.",
                "path: id",
                "MediaAssetDto"),
            ["POST /api/v1/media/upload"] = new(
                "Загрузка медиа",
                "Принимает файл (multipart/form-data), определяет тип и сохраняет ассет в хранилище.",
                "multipart: file (binary), title, type",
                "MediaUploadResult (status, path, filename, duration, ...)"),
            ["POST /api/v1/media/upload-audio"] = new(
                "Загрузка аудио",
                "Совместимость с фронтендом: загружает аудио-ассет и возвращает путь, имя файла и длительность.",
                "multipart: file (binary, audio)",
                "MediaUploadResult"),
            ["POST /api/v1/media/upload-music"] = new(
                "Загрузка музыки",
                "Загружает пользовательский музыкальный трек в аудиотеку проекта.",
                "multipart: file (binary, audio)",
                "MediaUploadResult"),
            ["DELETE /api/v1/media/{id}"] = new(
                "Удаление медиа",
                "Удаляет ассет и связанный физический файл.",
                "path: id",
                "204 No Content"),
            ["POST /api/v1/media/{id}/normalize"] = new(
                "Нормализация B-Roll",
                "Приводит B-Roll видео к заданному разрешению/FPS (перекодирование, обрезка, letterbox).",
                "path: id; body: { width, height, fps }",
                "NormalizedBrollDto"),
            ["GET /api/v1/media/music/catalog"] = new(
                "Каталог музыки",
                "Возвращает встроенную музыкальную библиотеку с необязательным фильтром по настроению.",
                "query: mood",
                "MusicTrackDto[]"),
            ["GET /api/v1/media/stock/search"] = new(
                "Поиск стокового видео",
                "Ищет B-Roll на Pexels по запросу и ориентации.",
                "query: query, orientation, page, perPage",
                "StockVideoDto[]"),
            ["POST /api/v1/media/stock/import"] = new(
                "Импорт стокового видео",
                "Скачивает стоковое видео по ссылке и регистрирует его как медиа-ассет.",
                "body: ImportStockVideoRequest { download_url, title }",
                "201 Created: MediaAssetDto"),
            ["POST /api/v1/media/process-broll"] = new(
                "Обработка B-Roll",
                "Выполняет пост-обработку B-Roll: кроп/фит, FPS, длительность, извлечение аудио.",
                "body: ProcessBrollCommand",
                "ProcessBrollResponse"),
            ["POST /api/v1/media/auto-broll"] = new(
                "AI-автоподбор B-Roll",
                "По визуальным ремаркам фрагментов подбирает подходящие B-Roll футажи (LLM + сток).",
                "body: AutoBrollCommand { project_path, format, engine, api_keys, fragments[] }",
                "AutoBrollResponse { status, results[] }"),
            ["GET /api/v1/media/stream"] = new(
                "Стриминг медиа",
                "Отдаёт файл с поддержкой HTTP Range (206) для скраббинга видео/аудио.",
                "query: path",
                "binary stream (Range)"),
            ["GET /api/v1/render/media"] = new(
                "Стриминг медиа (compat)",
                "Совместимый с фронтендом стриминг файла; умеет находить ассеты в temp/voice и проектах.",
                "query: path",
                "binary stream"),
            ["GET /api/v1/media/search-stock"] = new(
                "Поиск стока (compat)",
                "Совместимый с фронтендом поиск стоковых видео.",
                "query: query, orientation",
                "StockVideoDto[]"),
            ["POST /api/v1/media/download-stock"] = new(
                "Скачать сток (compat)",
                "Совместимость с фронтендом: скачивает стоковое видео по URL и filename.",
                "body: { url, filename, project_path?, folder? }",
                "{ status, path }"),
            ["GET /api/v1/media/music-library"] = new(
                "Музыкальная библиотека (compat)",
                "Совместимость с фронтендом: категории треков и пользовательские треки.",
                "—",
                "MediaMusicLibraryResponse { status, categories[], custom_tracks[] }"),

            // ─────────────────────────────── Motion ──────────────────────────────
            ["GET /api/v1/motion/capabilities"] = new(
                "Возможности Remotion",
                "Возвращает доступные пакеты/возможности рендера сцен.",
                "—",
                "string[]"),
            ["GET /api/v1/motion/scenes/{id}"] = new(
                "Код сцены по ID",
                "Возвращает агрегат SceneCode с активной ревизией и композицией.",
                "path: id (SceneCodeId)",
                "SceneCodeDto"),
            ["GET /api/v1/motion/projects/{projectId}/scenes/{sceneId}"] = new(
                "Код сцены по проекту",
                "Находит SceneCode по паре (projectId, sceneId).",
                "path: projectId, sceneId",
                "SceneCodeDto | 404"),
            ["GET /api/v1/motion/scenes/{id}/revisions/{revision}"] = new(
                "Ревизия кода сцены",
                "Возвращает конкретную ревизию TSX-кода сцены.",
                "path: id, revision",
                "SceneRevisionDto"),
            ["POST /api/v1/motion/scenes/generate"] = new(
                "Генерация кода сцены (LLM)",
                "Генерирует TSX-код сцены через LLM с учётом темы, композиции и возможностей; сохраняет как AiGenerated-ревизию.",
                "body: GenerateSceneCodeRequest { project_id, scene_id, visual_description, voice_text, duration_seconds, width, height, fps, montage_settings, capabilities }",
                "201 Created: SceneCodeDto"),
            ["PUT /api/v1/motion/scenes/{id}"] = new(
                "Ручное сохранение кода сцены",
                "Добавляет вручную отредактированную ревизию TSX-кода.",
                "path: id; body: UpdateSceneCodeManualRequest { code }",
                "SceneCodeDto"),
            ["POST /api/v1/motion/scenes/{id}/rollback"] = new(
                "Откат ревизии сцены",
                "Откатывает активную ревизию кода к указанному номеру.",
                "path: id; body: RollbackSceneCodeRequest { target_revision }",
                "SceneCodeDto"),
            ["POST /api/v1/motion/scenes/{id}/render"] = new(
                "Рендер сцены",
                "Ставит в очередь задачу рендеринга указанной ревизии сцены.",
                "path: id; body: StartRenderRequest { revision_number?, montage_settings? }",
                "202 Accepted: RenderJobDto"),
            ["GET /api/v1/motion/renders/{jobId}"] = new(
                "Статус рендера",
                "Возвращает прогресс/статус задачи рендеринга.",
                "path: jobId",
                "RenderJobDto"),
            ["POST /api/v1/motion/renders/{jobId}/cancel"] = new(
                "Отмена рендера",
                "Отменяет задачу рендеринга.",
                "path: jobId",
                "{ message }"),
            ["POST /api/v1/code/generate"] = new(
                "Генерация TSX (compat)",
                "Совместимый с фронтендом эндпоинт кодогенерации сцены: собирает системный промпт из скилов и возможностей.",
                "body: CodeGenerateCompatRequest { prompt, target_id?, project_path?, engine?, project_data?, api_keys? }",
                "CodeGenerateResponse { status, tsx_code, applied_stage, included_skills[] }"),
            ["POST /api/v1/render/start"] = new(
                "Старт рендера (compat)",
                "Совместимый с фронтендом старт рендера: идемпотентно сохраняет присланный tsx_code в SceneCode (создаёт при необходимости) и ставит рендер.",
                "body: RenderStartCompatRequest { target_id, project_id?, target?, project_path?, tsx_code?, audio_path?, broll_sources?, background_music?, render_quality? }",
                "{ status, task_id }"),
            ["POST /api/v1/render/cancel/{jobId}"] = new(
                "Отмена рендера (compat)",
                "Совместимая с фронтендом отмена задачи рендеринга.",
                "path: jobId",
                "{ status }"),

            // ───────────────────────────── Production ────────────────────────────
            ["POST /api/v1/production/projects"] = new(
                "Создать проект",
                "Создаёт новый проект производства.",
                "body: CreateProjectRequest",
                "201 Created: ProjectDetailsDto"),
            ["GET /api/v1/production/projects"] = new(
                "Список проектов",
                "Постранично возвращает проекты производства.",
                "query: page, pageSize",
                "PagedResult<ProjectSummaryDto>"),
            ["GET /api/v1/production/projects/{id}"] = new(
                "Проект по ID",
                "Возвращает полные данные проекта производства.",
                "path: id",
                "ProjectDetailsDto"),
            ["POST /api/v1/production/projects/{id}/scenario"] = new(
                "Разбор сценария",
                "Парсит Markdown-сценарий и сохраняет сцены/фрагменты в проект.",
                "path: id; body: ParseScenarioRequest",
                "ProjectDetailsDto"),
            ["PUT /api/v1/production/projects/{id}/scenes/{sceneId}"] = new(
                "Обновить сцену",
                "Обновляет данные сцены проекта.",
                "path: id, sceneId; body: UpdateSceneRequest",
                "ProjectDetailsDto"),
            ["POST /api/v1/production/projects/{id}/build"] = new(
                "Собрать проект",
                "Запускает полную сборку проекта (озвучка → синхронизация → код → рендер).",
                "path: id; body: BuildProjectRequest?",
                "202 Accepted: BuildStatusDto"),
            ["GET /api/v1/production/projects/{id}/build/status"] = new(
                "Статус сборки",
                "Возвращает статус текущей сборки проекта.",
                "path: id",
                "BuildStatusDto"),
            ["POST /api/v1/production/projects/{id}/cancel"] = new(
                "Отменить сборку",
                "Отменяет активную сборку проекта.",
                "path: id",
                "{ message }"),
            ["DELETE /api/v1/production/projects/{id}"] = new(
                "Удалить проект",
                "Удаляет проект производства.",
                "path: id",
                "204 No Content"),
            ["GET /api/v1/production/projects/{id}/export/bridge"] = new(
                "Экспорт моста проекта",
                "Возвращает нормализованный снапшот проекта (G3 bridge) для внешних контуров.",
                "path: id",
                "ProjectDataDto"),
            ["POST /api/v1/render/concat-video"] = new(
                "Склейка видео (compat)",
                "Совместимость с фронтендом: конкатенирует видео сцен в один файл через ffmpeg.",
                "body: ConcatVideoCompatRequest { video_paths[], output_path, project_path? }",
                "{ status }"),
            ["POST /api/v1/render/export"] = new(
                "Экспорт проекта (compat)",
                "Совместимость с фронтендом: упаковывает SCENARIO.md в zip-архив.",
                "body: ExportProjectCompatRequest { project_name, markdown }",
                "application/zip"),

            // ────────────────────────── Scenario Engine ──────────────────────────
            ["POST /api/v1/production/engine/{projectId}/sync"] = new(
                "Синхронизация Markdown ⇄ AST",
                "Двусторонняя синхронизация сценария IDE: парсит Markdown, пересобирает AST и блоки, сохраняет в БД.",
                "path: projectId; body: EngineSyncRequest { markdown }",
                "EngineSyncEnvelopeResponse { status, data }"),
            ["POST /api/v1/production/engine/lint-draft"] = new(
                "Линт черновика",
                "Stateless-проверка черновика сценария (парсер + линтер), без сохранения.",
                "body: EngineSyncRequest { markdown }",
                "DraftLintEnvelopeResponse { status, data }"),
            ["POST /api/v1/production/engine/{projectId}/lint"] = new(
                "Режиссёрский линтер",
                "Эвристический линтер проекта (без LLM): находит проблемы ритма, структуры и удержания.",
                "path: projectId",
                "ScenarioLintResponse { status, issues[], summary }"),
            ["POST /api/v1/production/engine/{projectId}/copilot/rewrite"] = new(
                "ИИ-рерайтинг фрагмента",
                "LLM-копайлот предлагает варианты переписывания фрагмента по команде (короче, кликбейтнее и т.п.).",
                "path: projectId; body: CopilotRewriteRequest { fragment_id, command, include_trend_context? }",
                "CopilotRewriteResponse { status, suggestions[] }"),

            // ───────────────────────────── Research ─────────────────────────────
            ["POST /api/v1/research/start"] = new(
                "Запустить исследование",
                "Создаёт сессию DeepTrend-исследования (YouTube-ниша, тренды).",
                "body: StartResearchRequest",
                "202 Accepted: ResearchRunSummaryDto"),
            ["GET /api/v1/research/runs"] = new(
                "Список исследований",
                "Постраничный список сессий исследования.",
                "query: page, pageSize",
                "PagedResult<ResearchRunSummaryDto>"),
            ["GET /api/v1/research/runs/{id}"] = new(
                "Детали исследования",
                "Возвращает подробности прогона исследования.",
                "path: id",
                "ResearchRunDetailsDto"),
            ["GET /api/v1/research/runs/{id}/opportunities"] = new(
                "Возможности прогона",
                "Возвращает найденные контентные возможности (идеи/тренды).",
                "path: id",
                "OpportunityDto[]"),
            ["GET /api/v1/research/runs/{id}/export"] = new(
                "Экспорт исследования (xlsx)",
                "Формирует Excel-отчёт по результатам прогона.",
                "path: id",
                "xlsx binary"),
            ["POST /api/v1/research/export/excel"] = new(
                "Ad-hoc экспорт (xlsx)",
                "Экспортирует произвольные данные исследования в Excel.",
                "body: AdHocExportData",
                "xlsx binary"),
            ["POST /api/v1/research/runs/{id}/cancel"] = new(
                "Отмена исследования",
                "Отменяет активный прогон исследования.",
                "path: id",
                "{ message }"),
            ["GET /api/v1/research/runs/{id}/stream"] = new(
                "SSE-поток исследования",
                "Отдаёт Server-Sent Events с шагами выполнения DAG-пайплайна.",
                "path: id",
                "text/event-stream"),

            // ─────────────────────────── YouTube Agent ───────────────────────────
            ["POST /api/v1/youtube/agent/stream"] = new(
                "Стриминг агента",
                "Запускает DAG-пайплайн DeepTrend-агента и стримит шаги в NDJSON.",
                "body: StreamAgentRequest { query, project_path?, settings?, youtube_key?, llm_engine?, api_keys? }",
                "NDJSON stream"),
            ["POST /api/v1/youtube/agent/suggest-competitors"] = new(
                "Подбор конкурентов",
                "LLM предлагает список популярных каналов в нише.",
                "body: SuggestCompetitorsRequest { niche, engine?, language?, api_keys? }",
                "{ status, channels[] }"),
            ["POST /api/v1/youtube/agent/analyze-channel"] = new(
                "Анализ канала",
                "Собирает контекст канала/ниши (позиционирование, темы) для генерации.",
                "body: AnalyzeChannelRequest { url_or_name, engine?, language?, youtube_key?, api_keys? }",
                "AnalyzeChannelResponse { status, context }"),
            ["POST /api/v1/youtube/agent/analyze-hook"] = new(
                "Анализ хука",
                "Анализирует вступление видео: психология хука, ошибки, готовые «украденные» хуки и heatmap удержания.",
                "body: AnalyzeHookRequest { transcript?, video_id?, video_url?, engine?, language?, api_keys? }",
                "AnalyzeHookResponse { status, data: HookAnalysisDto }"),
            ["POST /api/v1/youtube/agent/draft-script"] = new(
                "Черновик сценария",
                "Генерирует Markdown-сценарий по теме с учётом правил парсинга Vidora.",
                "body: DraftScriptRequest { title, idea_description?, channel_context?, engine?, language?, target_duration?, video_type?, custom_prompt?, audio_engine? }",
                "DraftScriptResponse { status, markdown }"),
            ["POST /api/v1/youtube/more-videos"] = new(
                "Ещё видео",
                "Возвращает дополнительные видео по запросу (пагинация трендов).",
                "body: MoreVideosRequest { query, exclude_video_ids?, settings?, language?, youtube_key?, api_keys? }",
                "MoreVideosResponse { status, results[] }"),
            ["POST /api/v1/youtube/download-meta"] = new(
                "Скачать метаданные видео",
                "Скачивает метаданные/субтитры видео для импорта в IDE.",
                "body: DownloadMetaRequest { url, project_path? }",
                "DownloadMetaDataResponse"),
            ["GET /api/v1/youtube/video/{videoId}/heatmap"] = new(
                "Тепловая карта удержания",
                "Возвращает heatmap удержания зрителей по видео.",
                "path: videoId",
                "VideoHeatmapResponse"),
            ["GET /api/v1/youtube/video/{videoId}/chapters"] = new(
                "Главы видео",
                "Возвращает главы видео с таймкодами и превью.",
                "path: videoId",
                "VideoChaptersResponse"),
            ["GET /api/v1/youtube/video/{videoId}/comments-detailed"] = new(
                "Комментарии видео",
                "Возвращает детальные комментарии с категоризацией.",
                "path: videoId; query: maxComments",
                "VideoCommentsResponse"),
            ["GET /api/v1/youtube/video/{videoId}/deep-dive"] = new(
                "Глубокий анализ видео",
                "Параллельно собирает метаданные, heatmap, главы и комментарии по видео.",
                "path: videoId; query: maxComments",
                "VideoDeepDiveDto"),

            // ────────────────────────────── Skills ───────────────────────────────
            ["GET /api/v1/skills"] = new(
                "Список скилов",
                "Возвращает скилы (навыки ИИ) с фильтром по стадии пайплайна и признаку включённости.",
                "query: stage, only_enabled",
                "SkillDto[]"),
            ["GET /api/v1/skills/bundle/{stage}"] = new(
                "Бандл промптов по стадии",
                "Собирает системный промпт из активных скилов стадии с учётом лимита токенов.",
                "path: stage; query: max_tokens, custom_header",
                "SkillBundleDto"),
            ["GET /api/v1/skills/{id}"] = new(
                "Скил по ID",
                "Возвращает один скил.",
                "path: id",
                "SkillDto"),
            ["POST /api/v1/skills"] = new(
                "Создать скил",
                "Создаёт новый пользовательский скил.",
                "body: CreateSkillRequest { id, name, description, stage, content, priority?, tags? }",
                "201 Created: SkillDto"),
            ["PUT /api/v1/skills/{id}"] = new(
                "Обновить скил",
                "Обновляет поля скила (name, description, content, priority, is_enabled, tags).",
                "path: id; body: UpdateSkillRequest",
                "SkillDto"),
            ["PATCH /api/v1/skills/{id}"] = new(
                "Частично обновить скил",
                "Алиас PUT: обновляет поля скила.",
                "path: id; body: UpdateSkillRequest",
                "SkillDto"),
            ["POST /api/v1/skills/{id}/reset"] = new(
                "Сбросить скил",
                "Сбрасывает базовый скил к системному шаблону.",
                "path: id",
                "SkillDto"),
            ["DELETE /api/v1/skills/{id}"] = new(
                "Удалить скил",
                "Удаляет пользовательский скил.",
                "path: id",
                "204 No Content"),

            // ────────────────────────────── System ───────────────────────────────
            ["GET /api/v1/system/status"] = new(
                "Статус железа",
                "Метрики CPU, RAM, VRAM и загрузки процессов.",
                "—",
                "SystemHardwareStatusDto"),
            ["GET /api/v1/system/settings"] = new(
                "Настройки системы",
                "Список системных настроек (key/value).",
                "—",
                "SystemSettingDto[]"),
            ["GET /api/v1/system/settings/{key}"] = new(
                "Настройка по ключу",
                "Возвращает значение настройки по ключу.",
                "path: key",
                "SystemSettingDto"),
            ["PUT /api/v1/system/settings/{key}"] = new(
                "Обновить настройку",
                "Устанавливает значение системной настройки.",
                "path: key; body: UpdateSettingRequest { value }",
                "SystemSettingDto"),
            ["GET /api/v1/system/models"] = new(
                "AI модели",
                "Каталог доступных локальных/облачных AI-моделей и их статус загрузки.",
                "—",
                "AiModelDto[]"),
            ["GET /api/v1/system/models/catalog"] = new(
                "Каталог моделей по ролям",
                "Единый каталог моделей с ролями конвейера и доступностью.",
                "query: role",
                "ModelCatalogEntryDto[]"),
            ["POST /api/v1/system/models/{modelId}/download"] = new(
                "Скачать модель",
                "Запускает загрузку весов модели.",
                "path: modelId",
                "202 Accepted: AiModelDto"),
            ["POST /api/v1/system/maintenance/clean-temp"] = new(
                "Очистить temp",
                "Удаляет временные файлы системы.",
                "—",
                "{ message }"),
            ["GET /api/v1/system/dead-letters"] = new(
                "DLQ шины событий",
                "Возвращает неуспешно обработанные события (dead letters).",
                "—",
                "DeadLetterResponse[]"),
            ["GET /api/v1/system/logs"] = new(
                "Системные логи",
                "Возвращает последние структурированные логи с фильтром по уровню.",
                "query: limit, level",
                "SystemLogEntryDto[]"),
            ["POST /api/v1/system/history"] = new(
                "Сохранить ревизию TSX (compat)",
                "Совместимость: сохраняет ручную ревизию TSX-кода сцены.",
                "body: SaveCodeRevisionRequest { project_id, scene_id, tsx_code }",
                "{ status }"),
            ["GET /api/v1/system/history/{projectId}/{sceneId}"] = new(
                "История ревизий сцены",
                "Список ревизий TSX-кода сцены.",
                "path: projectId, sceneId",
                "{ revisions[] }"),
            ["GET /api/v1/system/history/{projectId}/{sceneId}/{revisionId}"] = new(
                "Ревизия сцены (compat)",
                "Возвращает TSX-код конкретной ревизии.",
                "path: projectId, sceneId, revisionId",
                "{ tsx_code }"),
            ["GET /api/v1/system/hardware"] = new(
                "Информация о железе",
                "Краткая информация об устройстве: GPU/CPU, VRAM, RAM.",
                "—",
                "SystemHardwareInfoDto"),
            ["POST /api/v1/system/pull"] = new(
                "Pull модели",
                "Запускает скачивание модели через внешний менеджер (Ollama/HF).",
                "body: PullModelRequest { engine }",
                "202 Accepted: AiModelDto"),
            ["POST /api/v1/system/skills/{id}/reset"] = new(
                "Сбросить скил (compat)",
                "Совместимость: сбрасывает скил к системному шаблону.",
                "path: id",
                "SkillDto"),

            // ─────────────────────────────── Voice ───────────────────────────────
            ["GET /api/v1/voice/engines"] = new(
                "Движки озвучки",
                "Список TTS-движков (локальные/облачные) с поддержкой клонирования и дизайна.",
                "—",
                "VoiceEngineInfoDto[]"),
            ["POST /api/v1/voice/synthesize"] = new(
                "Синтез речи",
                "Синтезирует речь по тексту и диктору; опционально выравнивает слова (Whisper).",
                "body: SynthesizeSpeechRequest { text, speaker_id, engine?, speed?, pitch?, guidance_scale?, num_steps?, alignment_engine?, reference_audio_path? }",
                "VoiceJobDto"),
            ["POST /api/v1/voice/batch"] = new(
                "Пакетный синтез",
                "Синтезирует несколько реплик за один вызов.",
                "body: BatchSynthesizeRequest { items[], filters? }",
                "BatchVoiceResultDto"),
            ["GET /api/v1/voice/jobs/{id}"] = new(
                "Статус TTS-задачи",
                "Возвращает статус и результат задачи синтеза.",
                "path: id",
                "VoiceJobDto"),
            ["POST /api/v1/voice/ducking"] = new(
                "Дакинг музыки",
                "Микширует голос и фоновую музыку с sidechain-дакингом.",
                "body: DuckingRequest { voice_asset_id, bgm_asset_id, music_attenuation_db?, attack_ms?, release_ms? }",
                "DuckedAudioResultDto"),
            ["GET /api/v1/voice/speakers"] = new(
                "Дикторы",
                "Список доступных дикторов (id, имя, движок, язык, пол).",
                "—",
                "VoiceSpeakerDto[]"),
            ["GET /api/v1/voice/speakers/profiles"] = new(
                "Профили дикторов",
                "Все профили дикторов из БД: BuiltIn, Designed, Cloned.",
                "—",
                "SpeakerProfileDto[]"),
            ["GET /api/v1/voice/speakers/profiles/{id}"] = new(
                "Профиль диктора",
                "Возвращает профиль диктора по ID.",
                "path: id",
                "SpeakerProfileDto | 404"),
            ["POST /api/v1/voice/speakers/profiles/clone"] = new(
                "Клонировать голос",
                "Создаёт клон голоса по референсному аудио (локально OmniVoice или в облаке MiniMax).",
                "multipart: name, engine, referenceAudio (binary), referenceText?, language?, localEngineId?",
                "201 Created: SpeakerProfileDto"),
            ["POST /api/v1/voice/speakers/profiles/design"] = new(
                "Voice Design",
                "Создаёт голос по текстовому описанию тембра (локальный OmniVoice).",
                "body: CreateDesignedSpeakerRequest { name, engine, prompt, local_engine_id? }",
                "201 Created: SpeakerProfileDto"),
            ["PUT /api/v1/voice/speakers/profiles/{id}"] = new(
                "Обновить профиль диктора",
                "Переименовывает профиль диктора.",
                "path: id; body: UpdateSpeakerRequest { name }",
                "SpeakerProfileDto"),
            ["DELETE /api/v1/voice/speakers/profiles/{id}"] = new(
                "Удалить профиль диктора",
                "Удаляет профиль и связанные файлы (.pt/.wav).",
                "path: id",
                "204 No Content"),
            ["POST /api/v1/voice/speakers/profiles/{id}/preview"] = new(
                "Превью диктора",
                "Генерирует превью-сэмпл для профиля диктора.",
                "path: id; body: GeneratePreviewRequest",
                "VoiceJobDto"),
            ["POST /api/v1/voice/align"] = new(
                "Выравнивание слов",
                "Выравнивает фрагменты текста по аудио (forced alignment).",
                "body: AlignSpeechRequest { audio_path, fragments[] }",
                "AlignSpeechResponse"),
            ["POST /api/v1/voice/transcribe"] = new(
                "Транскрибация",
                "Распознаёт речь из аудиофайла (Whisper).",
                "body: TranscribeAudioRequest { audio_path }",
                "TranscribeAudioResponse { status, text }"),
            ["POST /api/v1/voice/process-dsp"] = new(
                "DSP-обработка аудио",
                "Пост-обработка аудио (мастеринг/шумоподавление/обрезка тишины).",
                "body: ProcessAudioDspRequest { audio_path, action, threshold_db?, min_silence_ms?, max_silence_ms? }",
                "ProcessAudioDspResponse"),
            ["POST /api/v1/voice/concat"] = new(
                "Склейка аудио",
                "Конкатенирует несколько аудиофайлов в один.",
                "body: ConcatAudioRequest { audio_paths[], output_path }",
                "{ status, output_path }"),
            ["POST /api/v1/voice/vram/unload"] = new(
                "Выгрузить VRAM",
                "Освобождает VRAM локального ML-воркера и GPU-стека.",
                "—",
                "{ status }"),
            ["POST /api/v1/audio/generate"] = new(
                "Озвучка (compat)",
                "Совместимый с фронтендом синтез речи; возвращает имя аудио и длительность.",
                "body: SynthesizeSpeechRequest",
                "{ status, audio_url, duration }"),
            ["POST /api/v1/audio/sync"] = new(
                "Синхронизация (compat)",
                "Совместимая с фронтендом синхронизация таймингов по аудио.",
                "body: AlignSpeechRequest",
                "AlignSpeechResponse"),
            ["POST /api/v1/audio/process"] = new(
                "Обработка аудио (compat)",
                "Совместимая с фронтендом DSP-обработка аудио.",
                "body: ProcessAudioDspRequest",
                "ProcessAudioDspResponse"),
            ["POST /api/v1/audio/process/advanced-silence"] = new(
                "Умная обрезка пауз (compat)",
                "Совместимая обработка: удаляет длинные паузы из аудио.",
                "body: ProcessAudioDspRequest",
                "ProcessAudioDspResponse"),
            ["POST /api/v1/audio/transcribe"] = new(
                "Транскрибация (compat)",
                "Совместимое распознавание речи из аудио.",
                "body: TranscribeAudioRequest",
                "TranscribeAudioResponse"),
            ["POST /api/v1/audio/concat"] = new(
                "Склейка аудио (compat)",
                "Совместимая конкатенация аудиофайлов.",
                "body: ConcatAudioRequest",
                "{ status, output_path }"),
            ["POST /api/v1/audio/vram/unload"] = new(
                "Выгрузка VRAM (compat)",
                "Совместимая выгрузка VRAM.",
                "—",
                "{ status }"),
            ["POST /api/v1/audio/preview-ducking"] = new(
                "Превью дакинга",
                "Собирает короткий предпросмотр микса голос + музыка.",
                "body: PreviewDuckingRequest",
                "DuckingPreviewResponse"),
            ["POST /api/v1/audio/batch-upload-scenes"] = new(
                "Пакетная загрузка аудио сцен",
                "Загружает несколько аудиофайлов и сопоставляет их со сценами по имени.",
                "multipart: project_path, scene_ids[] (JSON), files[]",
                "BatchUploadScenesResponse { status, matches[], unmatched_files[] }"),
        };
}

/// <summary>
/// Подставляет Summary/Description и описания параметров в Swagger-операции
/// из централизованного словаря <see cref="ApiDocumentation"/>.
/// </summary>
public sealed class ApiDocumentationOperationFilter : IOperationFilter
{
    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var method = (context.ApiDescription.HttpMethod ?? "GET").ToUpperInvariant();
        var path = NormalizePath(context.ApiDescription.RelativePath);

        if (ApiDocumentation.Endpoints.TryGetValue($"{method} {path}", out var doc))
        {
            operation.Summary = doc.Summary;
            operation.Description =
                $"**Что делает:** {doc.Description}\n\n" +
                $"**Вход:** {doc.Input}\n\n" +
                $"**Выход:** {doc.Output}";

            if (operation.RequestBody is not null)
            {
                operation.RequestBody.Description = doc.Input;
            }
        }

        // Описания параметров проставляем всегда, независимо от того,
        // есть ли операция в словаре (path/query параметры).
        if (operation.Parameters is not null)
        {
            foreach (var parameter in operation.Parameters)
            {
                if (parameter.Name is not null
                    && string.IsNullOrWhiteSpace(parameter.Description)
                    && ApiDocumentation.ParameterDescriptions.TryGetValue(parameter.Name, out var parameterDoc))
                {
                    parameter.Description = parameterDoc;
                }
            }
        }
    }

    /// <summary>Убирает inline-ограничения маршрута: {revision:int} → {revision}.</summary>
    private static string NormalizePath(string? relativePath)
    {
        var path = "/" + (relativePath ?? string.Empty).Trim('/');
        return System.Text.RegularExpressions.Regex.Replace(path, @"\{([^}:]+):[^}]+\}", "{$1}");
    }
}

/// <summary>
/// Проставляет описания полей схем (request/response body) из
/// <see cref="ApiDocumentation.PropertyDescriptions"/>.
/// </summary>
public sealed class ApiPropertyDocumentationSchemaFilter : ISchemaFilter
{
    public void Apply(IOpenApiSchema schema, SchemaFilterContext context)
    {
        if (context.Type is not null &&
            ApiDocumentation.RequestExamples.TryGetValue(context.Type.Name, out var example) &&
            schema is OpenApiSchema openApiSchema)
        {
            openApiSchema.Example = JsonNode.Parse(example);
        }

        if (schema.Properties is null || schema.Properties.Count == 0)
        {
            return;
        }

        foreach (var (propertyName, propertySchema) in schema.Properties)
        {
            if (propertySchema is null || !string.IsNullOrWhiteSpace(propertySchema.Description))
            {
                continue;
            }

            if (ApiDocumentation.PropertyDescriptions.TryGetValue(propertyName, out var description))
            {
                propertySchema.Description = description;
            }
        }
    }
}

