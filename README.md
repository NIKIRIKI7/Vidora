# Vidora

**AI-видеоредактор на основе Markdown-сценария.**

Напиши сценарий в структурированном Markdown — Vidora сам сгенерирует голос (TTS), анимацию (Remotion + LLM), синхронизирует звук с видео и соберёт готовый MP4.

## Возможности

- **Markdown → видео** — парсинг SCENARIO.md с YAML-фронтматером, сценами и фрагментами
- **AI озвучка** — локальный OmniVoice TTS (F5-TTS) с выбором голоса, клонированием, настройкой скорости/тона
- **AI анимация** — Ollama (qwen2.5-coder) генерирует Remotion TSX-компоненты по описанию сцены
- **Обработка аудио** — FFmpeg: денойз, нормализация (LUFS), удаление тишины, эквалайзер
- **Синхронизация** — whisperX forced alignment привязывает субтитры и анимацию к таймингам речи
- **Remotion-рендер** — сборка MP4 с прогрессом через WebSocket в реальном времени
- **Локально и нативно** — все AI-модели работают на машине пользователя; Electron-десктоп с бандлом Python-бэкенда
- **Редактор** — трёхпанельный интерфейс: сцены, скрипт/код, превью и управление генерацией

## Стек

**Фронтенд:** React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Zustand 5, Electron 43  
**Бэкенд:** Python 3.11+, FastAPI, WebSockets, OmniVoice, whisperX, FFmpeg, Ollama  
**Видео:** Remotion (программный рендеринг MP4 из React-компонентов)  
**Архитектура:** Feature-Sliced Design (FSD)

## Аналоги

| Продукт | Подход | Отличия от Vidora |
|---------|--------|-------------------|
| **Runway Gen-3** / **Pika Labs** | Текст → видео через diffusion | Облачные, не дают контроля над сценарием покадрово, дорогие подписки |
| **Synthesia** / **HeyGen** | Аватар + TTS по сценарию | Только talking head, закрытый код, облачная подписка |
| **Descript** | Редактор с AI-функциями | Требует ручного монтажа, не генерирует анимацию |
| **Invideo AI** | Текст → видео через шаблоны | Облачный, шаблонный визуал, без локального рантайма |
| **Manim** (3B1B) | Python-код → анимация | Требует программирования, нет TTS и голосового движка |

Ключевое отличие Vidora — **локальный запуск**, **структурированный Markdown-сценарий как единственный источник правды** и **полная генерация** (озвучка + анимация + синхронизация) одной командой.

## Быстрый старт

```bash
# фронтенд
cd frontend
pnpm install
pnpm dev

# бэкенд
cd backend
pip install -r requirements.txt
python -m app.main
```

Сценарий пишется в формате `SCENARIO.md` — спецификация в [docs/SCENARIO_RULES.md](docs/SCENARIO_RULES.md).

## Настройка AI-моделей

Бэкенд использует 4 модели. Все, кроме Ollama, скачиваются автоматически при первом запуске.

### 1. OmniVoice (TTS — озвучка)

Автоматически скачивается с HuggingFace при старте бэкенда.
- **Репозиторий:** [k2-fsa/OmniVoice](https://huggingface.co/k2-fsa/OmniVoice)
- **Вес:** ~3.2 ГБ (`model.safetensors` + `audio_tokenizer/model.safetensors`)
- **Куда сохраняется:** `backend/ai-models/OmniVoice/`
- **Python-пакет:** `omnivoice` (ставится из `requirements.txt`)

Если модель не загрузилась автоматически (медленный интернет, таймаут), скачайте вручную:

```bash
cd backend
python -c "
from huggingface_hub import snapshot_download
snapshot_download('k2-fsa/OmniVoice', local_dir='ai-models/OmniVoice')
"
```

### 2. WhisperX (распознавание речи + forced alignment)

Две модели скачиваются автоматически через библиотеку `whisperx` при первом вызове синхронизации (`POST /api/v1/audio/sync`):

| Модель | Назначение | Размер | Кеш HuggingFace |
|--------|-----------|--------|-----------------|
| `Systran/faster-whisper-base` | Транскрипция | ~300 МБ | `ai-models/models--Systran--faster-whisper-base/` |
| `jonatasgrosman/wav2vec2-large-xlsr-53-russian` | Выравнивание таймингов (русский) | ~1.2 ГБ | `ai-models/models--jonatasgrosman--wav2vec2-large-xlsr-53-russian/` |

При необходимости установите whisperX отдельно:

```bash
pip install whisperx
```

### 3. Ollama + qwen2.5-coder (LLM — генерация Remotion-кода)

Модель **не входит в бэкенд** и запускается как отдельный сервис.

```bash
# Установите Ollama: https://ollama.com
ollama pull qwen2.5-coder

# Запустите сервер
ollama serve
```

После этого бэкенд будет обращаться к `http://127.0.0.1:11434`.  
Если Ollama не запущен, кодогенерация вернёт fallback-сообщение (остальные функции не пострадают).

### Быстрая проверка

```bash
# Убедитесь, что все модели на месте
ls backend/ai-models/
# Должны быть папки: OmniVoice, models--Systran--faster-whisper-base, models--jonatasgrosman--wav2vec2-large-xlsr-53-russian

# Проверьте Ollama
ollama list | grep qwen2.5-coder
```

## Структура проекта

```
Vidora/
├── backend/          # Python FastAPI (TTS, LLM, рендер, синхронизация)
├── frontend/         # React + Electron (редактор, UI)
├── docs/             # Спецификации, дизайн-система, примеры
├── plugins/          # Плагины (будущее)
└── references/       # Референсы (будущее)
```

---

**Статус:** v0.1.0 — активная разработка.
