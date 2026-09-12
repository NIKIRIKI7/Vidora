# TODO — Vidora

_Обновлено: 2026-09-12_

## Отсутствующие эндпоинты в `backend2` (фронтенд вызывает — бэкенд не реализует)

Инвентарь: сопоставлены все вызовы `/api/v1/...` во `frontend/src` с роутами `backend2/src/Api/Endpoints`.

| Метод | Путь | Вызывает (frontend) | Ожидаемый контракт | Что нужно реализовать |
|:------|:-----|:--------------------|:-------------------|:----------------------|
| POST | `/api/v1/audio/batch-upload-scenes` | `pages/editor/model/useAudio.ts:545` | multipart: `project_path`, `scene_ids` (JSON-массив), `files[]` → `{ "status":"ok", "matches":[{"scene_id","absolute_path","duration"}], "unmatched_files":[...] }` | Пакетная загрузка аудио по сценам: матчинг файлов→сцены, сохранение в проект, проба длительности |
| POST | `/api/v1/media/auto-broll` | `pages/editor/model/useAutoPipeline.ts:88` | JSON: `{ project_path, format, engine, api_keys, fragments:[{id, visual_note, text, start_time, end_time, duration}] }` → `{ "status":"ok", "results":[{"fragment_id","matched","filename"}] }` | AI-автоподбор B-Roll по визуальным ремаркам (Pexels и др.) |
| GET | `/api/v1/system/hardware` | `widgets/global-settings/ui/GlobalSettingsView.tsx:80` | `{ vram_gb, ram_gb, device }` | Хардвар-статус для UI; сейчас есть только `/api/v1/system/status` с другим shape |
| POST | `/api/v1/system/pull` | `widgets/global-settings/ui/GlobalSettingsView.tsx:86` | JSON `{ engine }` | Триггер скачивания/пулла модели; сейчас есть только `/api/v1/system/models/{modelId}/download` |
| POST | `/api/v1/system/skills/{id}/reset` | `entities/skill/api/skillsApi.ts:156` | Сброс скила к seed-версии | Реальный роут — `/api/v1/skills/{id}/reset`; фронт зовёт устаревший `/system/skills/...` |
| GET | `/api/v1/youtube/video/{videoId}/heatmap` | `shared/api/youtube/api.ts:13` | `{ "heatmap":[HeatmapPoint] }` | Метрики повторного просмотра (retention) |
| GET | `/api/v1/youtube/video/{videoId}/chapters` | `shared/api/youtube/api.ts:20` | `{ "chapters":[VideoChapter] }` | Главы видео |
| GET | `/api/v1/youtube/video/{videoId}/comments-detailed?maxComments=` | `shared/api/youtube/api.ts:27` | `{ "comments":[DetailedComment] }` | Детальные комментарии к видео |
| GET | `/api/v1/youtube/video/{videoId}/deep-dive` | `shared/api/youtube/api.ts:34` | `{ "video_id", "metadata", "heatmap", "chapters", "comments" }` | Сводный deep-dive по видео |

## Несоответствия контрактов (роут есть, но метод/shape другой)

| Метод фронта | Метод/роут бэкенда | Проблема |
|:-------------|:-------------------|:---------|
| `PATCH /api/v1/skills/{id}` | `PUT /api/v1/skills/{id}` | Несовпадение HTTP-метода — обновление скила вернёт 405 |
| `GET /api/v1/system/hardware` | `GET /api/v1/system/status` | Разный shape ответа (`vram_gb/ram_gb/device` против статуса хоста) |
| `POST /api/v1/system/pull` | `POST /api/v1/system/models/{modelId}/download` | Разные пути и контракт триггера загрузки |

## Уже добавленные compatibility-эндпоинты (сделано)

- `POST /api/v1/media/upload` — `title`/`type` опциональны, авто-детект типа по MIME/расширению, ответ с `status/path/filename/duration`.
- `POST /api/v1/media/upload-audio`, `POST /api/v1/media/upload-music` — сохранение + проба длительности (WAV header / ffprobe).
- `POST /api/v1/audio/preview-ducking` — предпросмотр sidechain-ducking с обрезкой до `previewDuration`.
- `GET /api/v1/system/history/{projectId}/{sceneId}`, `GET .../{revisionId}`, `POST /api/v1/system/history` — история ревизий TSX.

## Текущее состояние

- Фронтенд переведён на Feature-Sliced Design: `app` / `pages/editor` / `widgets/*` / `features/*` / `entities/*` / `shared/*`. `pnpm lint:fsd` — без ошибок.
- `tsc` и `pnpm build` — без ошибок.
- Осталось реализовать перечисленные выше эндпоинты и выровнять контракты из второго раздела.
