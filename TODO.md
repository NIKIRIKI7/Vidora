# TODO — Vidora

_Обновлено: 2026-09-12_

## Реализовано: эндпоинты и выравнивание контрактов

Compatibility-эндпоинты, закрывающие разрывы фронтенда с `backend2`:

| Метод | Путь | Реализация |
|:------|:-----|:-----------|
| POST | `/api/v1/audio/batch-upload-scenes` | `VoiceEndpoints` + `VoiceModule.BatchUploadScenesAsync` (3-уровневый matching + замер длительности) |
| POST | `/api/v1/media/auto-broll` | `MediaEndpoints` + `MediaModule.AutoMatchBrollAsync` (LLM-запросы, Pexels, FFmpeg-нормализация) |
| GET | `/api/v1/system/hardware` | `SystemEndpoints` + `HardwareMonitorService.GetHardwareInfoAsync` (nvidia-smi + RAM) |
| POST | `/api/v1/system/pull` | `SystemEndpoints` + `SystemModule.PullModelAsync` (регистрация артефакта + ollama pull) |
| POST | `/api/v1/system/skills/{id}/reset` | алиас на `ISkillManagementService.ResetSkillToDefaultAsync` |
| PATCH | `/api/v1/skills/{id}` | `SkillsEndpoints` — общий обработчик для PUT и PATCH |
| GET | `/api/v1/youtube/video/{videoId}/heatmap` | `YouTubeAgentEndpoints` |
| GET | `/api/v1/youtube/video/{videoId}/chapters` | `YouTubeAgentEndpoints` |
| GET | `/api/v1/youtube/video/{videoId}/comments-detailed` | `YouTubeAgentEndpoints` |
| GET | `/api/v1/youtube/video/{videoId}/deep-dive` | `YouTubeAgentEndpoints` (конкурентный `Task.WhenAll`) |

Дополнительно (ранее):
- `POST /api/v1/media/upload` — `title`/`type` опциональны, авто-детект типа, ответ с `status/path/filename/duration`.
- `POST /api/v1/media/upload-audio`, `POST /api/v1/media/upload-music` — сохранение + проба длительности.
- `POST /api/v1/audio/preview-ducking` — предпросмотр sidechain-ducking.
- `GET /api/v1/system/history/{projectId}/{sceneId}`, `GET .../{revisionId}`, `POST /api/v1/system/history` — история ревизий TSX.

## Требуется установить/докачать (окружение)

### CLI-утилиты (в `backend2/tools/` или системный PATH)
- **FFmpeg / FFprobe ≥ 6.0** — склейка, blur-pad нормализация B-roll, sidechain ducking, замер длительности.
- **yt-dlp** — `backend2/tools/yt-dlp.exe`; загрузка референсных роликов и извлечение аудио.
- **Node.js LTS v20/v22** (строго ниже v24) — `backend2/tools/node22/node.exe` для сборщика Remotion.

### Render-workspace
- `cd backend2/tools/remotion_workspace && npm install`
- Пакеты: `@remotion/cli`, `remotion`, `react`, `react-dom`, `tailwindcss`, `lucide-react`, `@remotion/lottie`, `@react-three/fiber` (если включён 3D-режим).

### ML-модели
- **Faster-Whisper (CTranslate2):** `backend2/data_storage/ai-models/whisper/faster-whisper-small/` (`model.bin`, `config.json`, `vocabulary.json`, `tokenizer.json`).
- **Локальная LLM (GGUF):** `backend2/data_storage/ai-models/gemma3-4b/*.gguf` (например `gemma-3-4b-it-Q4_K_M.gguf` или `Qwen2.5-Coder-7B-Instruct-Q4_K_M.gguf`).

### Библиотеки NVIDIA CUDA (при инференсе на GPU)
- `cudart64_12.dll`, `cublas64_12.dll`, `cublasLt64_12.dll`, `cusparse64_12.dll` (CUDA Toolkit 12.x).
- `cudnn_ops_infer64_8.dll` (cuDNN v8.x для CTranslate2).

### API-ключи
- **Pexels** — `Integrations:Pexels:ApiKey` (appsettings).
- **Облачные LLM/TTS** — системные настройки `integrations.openai.api_key`, `integrations.minimax.api_key` + `integrations.minimax.group_id` (или RouterAI/AITunnel).
- **YouTube Data API v3** (опционально) — резервный канал скрапинга при блокировках InnerTube.

## Тесты и сборка

- Обновлены конструкторы в `MediaTests.cs` и `SystemOrmTests.cs` под новые зависимости (`ILlmClient`, `ISkillsCatalog`, `IProcessSupervisor`, `IPathResolver`).
- `dotnet build backend2/backend2.csproj` — 0 предупреждений / 0 ошибок.
- `dotnet test` требует остановки запущенного dev-сервера: он держит `backend2/bin/Debug/net10.0/backend2.dll` и блокирует сборку тестового проекта.
