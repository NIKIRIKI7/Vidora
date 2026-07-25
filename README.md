<p align="center">
  <img src="./assets/readme/hero.svg" width="100%"
       alt="Vidora — AI video pipeline from Markdown">
</p>

---

**Vidora** — это AI-пайплайн, который превращает Markdown-сценарии в готовые MP4-видео: синтез речи (TTS), анимация через Remotion, профессиональный аудиомастеринг и экспорт — в одном CLI и десктоп-приложении.

## Возможности

- **Markdown → видео** — пиши сценарий в `SCENARIO.md` с YAML-разметкой, получай готовый ролик
- **AI-озвучка** — OmniVoice TTS (F5-TTS) с разными голосами, темпами и тональностью
- **AI-анимация** — Ollama (qwen2.5-coder) генерирует Remotion TSX-сцену под твой сценарий
- **Аудиомастеринг** — FFmpeg: нормализация LUFS, компрессия, хайпасс, удаление тишины
- **Форсированное выравнивание** — WhisperX forced alignment субтитров к аудиодорожке
- **Remotion-рендер** — React-компоненты в MP4 через WebSocket
- **Десктоп-редактор** — Electron + React с визуальным редактором сцен, таймлайном и сток-библиотекой

## Чем Vidora отличается

| Продукт | Подход | Vidora лучше |
|---------|--------|-------------|
| Runway Gen-3 / Pika Labs | Текст → видео через diffusion | Контролируемый монтаж, точный сценарий, свой голос |
| Synthesia / HeyGen | Аватар + TTS | Без аватаров, полный контроль анимации, open-source |
| Descript | Мультитрек + AI-редактор | Программируемый пайплайн, Remotion-анимация, кодовая гибкость |
| Invideo AI | Текст → видео через шаблоны | Свой TTS, своя анимация, прозрачный пайплайн |
| Manim (3B1B) | Python для анимаций | TTS + анимация + мастеринг в одном флоу |

Vidora — это **программируемая альтернатива**: Markdown-сценарий → TTS + анимация + мастеринг под твоим контролем.

## Пайплайн

Проходит 4 стадии:

| Стадия | Инструмент | Результат |
|--------|-----------|-----------|
| 1. Озвучка | OmniVoice TTS | WAV-файл с голосом по тексту сценария |
| 2. Выравнивание | WhisperX forced alignment | Синхронизация слов с таймкодами |
| 3. Анимация | Ollama + qwen2.5-coder | Remotion TSX-сцена под текст |
| 4. Сборка | Remotion + FFmpeg | MP4 с анимацией, озвучкой и мастерингом |

Каждый этап можно запустить отдельно и перезапускать независимо.

## Быстрый старт

```bash
# Фронтенд + бэкенд одновременно
cd frontend
pnpm dev:all

# По отдельности:
pnpm dev              # Vite-клиент (порт 5173)
pnpm backend:dev      # FastAPI (порт 8355)
```

```bash
# Бэкенд вручную
cd backend
pip install -r requirements.txt
.venv\Scripts\uvicorn app.main:app --host 127.0.0.1 --port 8355 --reload
```

Сценарий пишется в `SCENARIO.md` по правилам из [docs/SCENARIO_RULES.md](docs/SCENARIO_RULES.md).

## Настройка AI-моделей

### 1. OmniVoice (TTS)

Скачивается с HuggingFace:

```bash
cd backend
python -c "
from huggingface_hub import snapshot_download
snapshot_download('k2-fsa/OmniVoice', local_dir='ai-models/OmniVoice')
"
```

- Репозиторий: [k2-fsa/OmniVoice](https://huggingface.co/k2-fsa/OmniVoice)
- Размер: ~3.2 ГБ
- Путь: `backend/ai-models/OmniVoice/`
- Python-пакет: `omnivoice` (автоматически из `requirements.txt`)

### 2. WhisperX (распознавание + forced alignment)

Модели скачиваются автоматически при первом запросе к `/api/v1/audio/sync`.

| Модель | Назначение | HuggingFace |
|--------|-----------|-------------|
| `Systran/faster-whisper-base` | Базовая транскрипция | Кеш в `ai-models/` |
| `jonatasgrosman/wav2vec2-large-xlsr-53-russian` | Русский язык | Кеш в `ai-models/` |

### 3. Ollama + qwen2.5-coder (LLM для генерации сцен)

Установка:

```bash
ollama pull qwen2.5-coder
ollama serve
```

API доступен на `http://127.0.0.1:11434`. Если Ollama недоступна — используется fallback-генератор (простой шаблон).

### Проверка моделей

```bash
ls backend/ai-models/
# Должны быть: OmniVoice, models--Systran--faster-whisper-base, ...
ollama list | grep qwen2.5-coder
```

## Структура проекта

```
Vidora/
├── backend/                     # Python FastAPI (TTS, LLM, рендер, мастеринг)
│   ├── app/                     # API, вебсокеты, задачи
│   └── remotion-project/        # Remotion-сборка React-компонентов
├── frontend/                    # React + Electron/Tauri (десктоп-редактор)
│   └── src/
│       ├── entities/project/    # Zustand-стор, типы
│       ├── features/            # File System API
│       ├── widgets/             # EditorWorkspace, ProjectCreator
│       └── shared/ui/           # Дизайн-система (Button, Modal, Dropdown…)
└── docs/                        # Документация, шаблоны, правила
```

## Стек

**Фронтенд:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Zustand 5, Tauri  
**Бэкенд:** Python 3.11+, FastAPI, WebSockets, OmniVoice, WhisperX, FFmpeg, Ollama  
**Рендер:** Remotion (React → MP4)  
**Архитектура:** Feature-Sliced Design (FSD)

---

**Версия:** v0.1.0 — активная разработка.
