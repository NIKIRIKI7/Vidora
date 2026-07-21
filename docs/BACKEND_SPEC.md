# Техническое задание на Бэкенд Vidora (FastAPI)

## 1. Архитектура и Стек
- **Фреймворк:** FastAPI (Python 3.11+)
- **Сервер:** Uvicorn
- **Валидация:** Pydantic v2
- **Асинхронность:** `asyncio` (обязательно для LLM и TTS вызовов)
- **Коммуникация:** REST API (управление, настройки) + WebSockets (стриминг прогресса рендера и генерации).

---

## 2. Структуры данных (Pydantic Models)

Необходимо синхронизировать модели с `types.ts` фронтенда.

```python
from pydantic import BaseModel, Field
from typing import List, Optional

class AppColors(BaseModel):
    primary: str
    secondary: str
    background: str
    surface: str
    accent: str
    text: str

class MontageSettings(BaseModel):
    fps: int
    animationStyle: str
    transitions: List[str] = []
    colors: AppColors

class SceneFragment(BaseModel):
    id: str
    visualNote: str
    text: str
    startTime: Optional[float] = None
    endTime: Optional[float] = None
    remotionCode: Optional[str] = None
    audioFileName: Optional[str] = None
    bRollFileName: Optional[str] = None

class Scene(BaseModel):
    id: str
    title: str
    timecode: str
    fragments: List[SceneFragment]
    remotionCode: Optional[str] = None

class ProjectData(BaseModel):
    name: str
    scenes: List[Scene]
    montage: MontageSettings

# --- Запросы на генерацию ---

class AudioGenerationRequest(BaseModel):
    fragment_id: str
    text: str
    voice_model: str = Field(..., description="aria, marcus, nova, clone")
    stability: float = Field(default=0.75, ge=0.0, le=1.0)
    clarity: float = Field(default=0.90, ge=0.0, le=1.0)
    ref_audio_path: Optional[str] = Field(None, description="Path to reference audio for cloning")
    ref_text: Optional[str] = Field(None, description="Text spoken in reference audio")

class CodeGenerationRequest(BaseModel):
    target_id: str = Field(..., description="Scene ID or Fragment ID")
    prompt: str
    project_data: ProjectData
```

---

## 3. REST API Эндпоинты

### Аудио (OmniVoice)
- **`POST /api/v1/audio/generate`**
  - **Body:** `AudioGenerationRequest`
  - **Описание:** Принимает текст и параметры голоса. Вызывает локальную модель (например, F5-TTS, GPT-SoVITS) или внешнее API (ElevenLabs).
  - **Response:** `{"status": "ok", "audio_url": "/files/voice/frag_123.wav", "duration": 4.5}`

- **`POST /api/v1/audio/upload-ref`**
  - **Описание:** Загрузка референсного аудио (WAV/MP3) для клонирования голоса (Voice Cloning).
  - **Response:** `{"ref_audio_path": "/files/refs/custom_voice.wav"}`

### LLM Генерация (Remotion TSX)
- **`POST /api/v1/code/generate`**
  - **Body:** `CodeGenerationRequest`
  - **Описание:** Отправляет промпт в LLM (например, Claude 3.5 Sonnet, GPT-4o или локальную Qwen2.5-Coder). LLM возвращает TSX код для компонента.
  - **Response:** `{"status": "ok", "tsx_code": "import { Composition }..."}`

### Обработка аудио (Audio Processing & Enhancement)
- **`POST /api/v1/audio/process`**
  - **Body:**
    ```json
    {
      "scene_id": "string",
      "audio_path": "/files/voice/scene_1.wav",
      "action": "denoise" // "denoise", "normalize", "remove_silence", "enhance"
    }
    ```
  - **Описание:** Выполняет обработку звука.
    - `denoise` — удаление фонового шума.
    - `normalize` — нормализация громкости (RMS / LUFS).
    - `remove_silence` — обрезка пустых участков (тишины и вздохов) для эффекта "jump cut".
    - `enhance` — студийное AI-улучшение голоса (компрессия, эквалайзер, де-эссер).
  - **Response:**
    ```json
    {
      "status": "ok",
      "processed_audio_path": "/files/voice/scene_1_processed.wav",
      "action_applied": "remove_silence"
    }
    ```

### Синхронизация (Audio-Text Alignment)
- **`POST /api/v1/audio/sync`**
  - **Body:**
    ```json
    {
      "scene_id": "string",
      "audio_path": "/files/voice/scene_1.wav",
      "fragments": [
        {"id": "frag-1", "text": "Сегодня мы посмотрим на монстра."},
        {"id": "frag-2", "text": "RTX 5090 разрушает все тесты."}
      ]
    }
    ```
  - **Описание:** Выполняет Forced Alignment (выравнивание текста по аудио). ИИ-модель (Whisper) распознает речь на уровне слов/фонем и сопоставляет их с текстом фрагментов, чтобы вычислить точные `startTime` и `endTime` для генерации Remotion видеоряда.
  - **Response:**
    ```json
    {
      "status": "ok",
      "fragments_timings": [
        {"id": "frag-1", "startTime": 0.0, "endTime": 2.4},
        {"id": "frag-2", "startTime": 2.6, "endTime": 5.1}
      ]
    }
    ```

### Рендеринг
- **`POST /api/v1/render/start`**
  - **Body:** `{"project_id": "string", "target": "scene|fragment|project", "target_id": "string"}`
  - **Описание:** Запускает процесс `npx remotion render` в фоне через `subprocess`. Процесс рендера будет транслироваться через WebSocket.
  - **Response:** `{"task_id": "render_8f73a"}`

---

## 4. WebSocket (Сокеты для Бэкенда)

Для UI критически важно видеть прогресс-бары в реальном времени, так как генерация аудио, кода и рендер видео — длительные операции.

**Endpoint:** `ws://127.0.0.1:8355/ws/events/{client_id}`

### Форматы сообщений (От сервера к клиенту):

1. **Прогресс рендера (Remotion):**
```json
{
  "type": "RENDER_PROGRESS",
  "payload": {
    "task_id": "render_8f73a",
    "target": "Сцена 1",
    "progress": 45,
    "frame": 230,
    "total_frames": 512,
    "status": "rendering"
  }
}
```

2. **Прогресс генерации аудио (Batch):**
```json
{
  "type": "AUDIO_GEN_PROGRESS",
  "payload": {
    "fragment_id": "frag-123-abc",
    "status": "processing",
    "percent": 80
  }
}
```

3. **Стриминг TSX Кода (Опционально):**
```json
{
  "type": "CODE_STREAM",
  "payload": {
    "target_id": "scene-456",
    "chunk": "return (<AbsoluteFill>..."
  }
}
```

---

## 5. Задачи (Tasks) для Backend-разработчика

### Task 1: Инициализация ядра FastAPI и WebSocket менеджера
- Настроить `app/main.py` с CORS middleware (разрешить запросы от Vite на порту 5173 и Electron).
- Реализовать класс `ConnectionManager` для WebSockets (методы `connect`, `disconnect`, `send_personal_message`, `broadcast`).
- Создать Pydantic схемы (из раздела 2) в `app/schemas.py`.

### Task 2: Интеграция OmniVoice (Генерация и Клонирование голоса)
- Настроить роутер `app/api/audio.py`.
- Реализовать `POST /api/v1/audio/generate`.
- **Интеграция:** Подключить локальный инференс F5-TTS / GPT-SoVITS (через `subprocess` или как импорт Python-библиотеки) ИЛИ сделать абстрактный класс-провайдер для API (OpenAI TTS, ElevenLabs).
- Учесть параметры `stability` и `clarity`.
- Реализовать сохранение сгенерированного файла в локальную директорию проекта и расчет длительности (длительность нужна фронтенду для корректировки таймлайна `durationInFrames`).

### Task 3: Интеграция LLM-агента для генерации TSX
- Настроить роутер `app/api/code.py`.
- Реализовать промптинг: Бэкенд получает от фронта JSON с настройками проекта и сценой, формирует системный промпт (из правил в `generateRemotionPrompt.ts`) и отправляет в LLM.
- Сделать фильтрацию ответа LLM (извлечение чистого TSX кода из Markdown-блока ` ```tsx ... ``` `).
- *(Бонус)*: Подключить стриминг ответа через WebSocket, чтобы код появлялся в редакторе по мере генерации.

### Task 4: Пайплайн Рендеринга (Remotion Wrapper)
- Настроить роутер `app/api/render.py`.
- Реализовать обертку над CLI-утилитой Remotion. Бэкенд должен запускать команду `npx remotion render src/index.ts <CompositionId> out/video.mp4`.
- **Парсинг логов:** Читать stdout/stderr процесса Remotion (он отдает прогресс в виде `230/512 frames rendered`). Регулярным выражением вытаскивать кадры, считать проценты и пушить в WebSocket `RENDER_PROGRESS`.
- Обрабатывать ошибки (недостаток памяти, ошибки компиляции TSX).

### Task 5: Управление файловой системой
- Разработать модуль `app/services/fs_manager.py`.
- Бэкенд должен иметь доступ к директории проекта пользователя (или получать пути от фронта).
- Функции: чтение/запись `SCENARIO.md`, сохранение `assets/`, `code/`, `voice/`.
*(Примечание: В текущей архитектуре Electron фронтенд использует File System Access API. Нужно решить, передает ли фронтенд бэкенду абсолютный путь к папке проекта для прямой записи).*

### Task 6: Автоматическая синхронизация (Audio-Text Alignment)
- **Суть задачи:** Привязать сгенерированный или загруженный голос к визуальным блокам (фрагментам), чтобы анимации в Remotion начинались ровно тогда, когда диктор произносит соответствующие слова.
- **Инструменты:** Использовать `faster-whisper` (со встроенным word-level timestamps) или `Wav2Vec2` для forced alignment.
- **Алгоритм реализации:**
  1. Бэкенд получает аудиофайл и массив текстов фрагментов.
  2. Модель прогоняет аудио, получая список всех сказанных слов с их таймкодами (начало и конец в секундах).
  3. Бэкенд сопоставляет транскрипцию с исходными текстами фрагментов (алгоритмами нечеткого поиска, например Levenshtein distance, или через Dynamic Time Warping).
  4. Для каждого `fragment_id` вычисляется точный `startTime` (время начала первого слова фрагмента) и `endTime` (время конца последнего слова фрагмента).
  5. Возвращает готовые тайминги на клиент.
- **Ограничения:** Учесть, что ИИ может ошибаться при транскрибации музыки или шумов, поэтому нужен fallback-механизм (например, расчет по среднему времени произношения: ~2.5 слова в секунду), если alignment завершился с ошибкой.

### Task 7: Обработка и мастеринг аудио (Audio Processing)
- **Суть задачи:** Реализовать эндпоинты для чистки и мастеринга аудио (загруженного пользователем или сгенерированного ИИ), чтобы добиться "студийного дикторского" качества звука и нужной динамики перед рендером видео.
- **Инструменты и реализации:**
  1. **Нормализация (Normalize):** Использовать библиотеку `ffmpeg-python`. Настроить `loudnorm` фильтр для приведения аудио к стандарту громкости (например, -14 LUFS для YouTube и TikTok).
  2. **Удаление шума (Denoise):** Использовать легковесные ИИ-модели для фильтрации шума. Подойдет интеграция `DeepFilterNet` или `RNNoise`. Они работают быстрее реального времени на CPU/GPU.
  3. **Удаление тишины и пауз (Silence Removal):**
     - *Вариант А (Легкий):* Использовать аудиофильтр FFmpeg `silenceremove`. Настроить пороги (например, удалять всё, что тише -35dB и длиннее 0.3 секунд).
     - *Вариант Б (AI-VAD, предпочтительный):* Использовать модель `silero-vad` (Voice Activity Detection). Она идеально отличает человеческую речь от тишины и вздохов. Скрипт должен разрезать аудио по timestamp'ам речи и склеить обратно (jump cut), оставляя микро-паузы в ~0.1с для естественности.
  4. **Улучшение голоса (AI Enhance):** Создать скрипт, который применяет цепочку эффектов (через FFmpeg или SoX):
     - High-pass filter (срез низких частот до 80 Гц).
     - Компрессор (сжатие динамического диапазона).
     - Легкий эквалайзер (поднятие 3-5 kHz для эффекта "присутствия").
- **Архитектура:** Все обработчики должны принимать путь к исходному файлу, создавать временный `.wav` файл в памяти или папке `/tmp/`, а после успешного применения заменять оригинал (или создавать новый файл с префиксом/суффиксом и отдавать новый путь на фронтенд). Учесть, что операция `remove_silence` изменит общую длину файла, и поэтому тайминги фрагментов (Task 6) нужно пересчитывать *после* этой операции.
