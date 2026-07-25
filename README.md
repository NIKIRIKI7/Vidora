<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./assets/readme/hero.svg">
    <img src="./assets/readme/hero.svg" width="100%" alt="Vidora — AI video pipeline from Markdown">
  </picture>
</p>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/ai-voiceover-8A2BE2?style=flat-square" alt="AI Voiceover"></a>
  <a href="#features"><img src="https://img.shields.io/badge/remotion-animation-00C4B4?style=flat-square" alt="Remotion Animation"></a>
  <a href="#features"><img src="https://img.shields.io/badge/ffmpeg-mastering-F26C6C?style=flat-square" alt="FFmpeg Mastering"></a>
  <a href="#features"><img src="https://img.shields.io/badge/electron-desktop-3B82F6?style=flat-square" alt="Electron Desktop"></a>
  <br>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License MIT"></a>
  <a href="./docs/SCENARIO_RULES.md"><img src="https://img.shields.io/badge/docs-scenario-8A2BE2?style=flat-square" alt="Scenario docs"></a>
</p>

---

**Vidora** — это AI-пайплайн, который превращает Markdown-сценарии в готовые MP4-видео. Синтез речи, Remotion-анимация, аудиомастеринг и десктоп-редактор — полностью локально, без облачных зависимостей.

---

<p align="center">
  <img src="./assets/readme/features.svg" width="100%" alt="Vidora capabilities: TTS, Remotion, mastering, alignment, desktop editor">
</p>

---

## Начало работы

### Быстрый старт (dev)

```bash
git clone https://github.com/NIKIRIKI7/Vidora.git
cd Vidora

# Windows:
powershell -ExecutionPolicy Bypass -File setup.ps1

# macOS / Linux:
# chmod +x setup.sh && ./setup.sh

# Запуск всего сразу:
cd frontend && pnpm dev:all
```

После установки открой **http://localhost:5173** в браузере. Бэкенд стартует на порту 8355.

### Пошаговая установка

#### 1. Бэкенд (Python 3.11+)

```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\pip install -r requirements.txt
# macOS / Linux:
# source .venv/bin/activate && pip install -r requirements.txt
```

#### 2. Фронтенд (Node.js 20+)

```bash
cd frontend
pnpm install
```

#### 3. Remotion (отдельный Node.js проект)

```bash
cd backend/remotion-project
npm install
```

#### 4. Ollama (опционально, для AI-генерации сцен)

```bash
# https://ollama.com
ollama pull qwen2.5-coder
ollama serve
```

### Запуск

```bash
cd frontend

# Три способа:

# A. Всё сразу (Vite + бэкенд):
pnpm dev:all

# B. По отдельности (три терминала):
pnpm dev              # Vite на порту 5173
pnpm backend:dev      # FastAPI на порту 8355
pnpm electron:dev     # Electron окно

# C. Electron production сборка:
pnpm backend:build    # PyInstaller → backend.exe
pnpm electron:build   # electron-packager → frontend/release/
```

---

## Возможности

- **Markdown → видео** — пиши сценарий в `SCENARIO.md` с YAML-шапкой, получай MP4
- **AI-озвучка** — OmniVoice TTS (F5-TTS), несколько голосов, клонирование, Voicebox
- **AI-анимация** — Ollama генерирует Remotion TSX-сцены под твой текст
- **Аудиомастеринг** — FFmpeg: LUFS, компрессор, хайпасс, удаление тишины
- **Форсированное выравнивание** — WhisperX word-level синхронизация с русской моделью
- **Десктоп-редактор** — Electron + React 19, три панели, темная тема, FSD
- **Undo/Redo** — 50 шагов истории изменений
- **Сток-библиотека** — Pexels интеграция, drag-n-drop B-roll
- **Тематические пресеты** — Dracula, Vercel, GitHub Dark, Tailwind Ocean

---

## Сравнение с аналогами

| Продукт | Подход | Vidora |
|---------|--------|--------|
| **Runway Gen-3 / Pika** | Текст → видео через diffusion | Точный сценарий, свой голос, монтаж |
| **Synthesia / HeyGen** | Аватар + TTS | Без аватаров, open-source, Remotion |
| **Descript** | Мультитрек + AI | Программируемый пайплайн, кодовая гибкость |
| **Invideo AI** | Текст → шаблоны | Свой TTS, своя анимация, прозрачность |
| **Manim (3B1B)** | Python-анимации | TTS + анимация + мастеринг в одном флоу |

Vidora — **программируемая альтернатива**: Markdown → TTS + Remotion + FFmpeg под твоим контролем. Полностью локально.

---

## Пайплайн

| Стадия | Инструмент | Результат |
|--------|-----------|-----------|
| 1. Озвучка | OmniVoice TTS | WAV с голосом по тексту сценария |
| 2. Выравнивание | WhisperX forced alignment | Слова, привязанные к таймкодам |
| 3. Анимация | Ollama + qwen2.5-coder | Remotion TSX-сцена под текст |
| 4. Сборка | Remotion + FFmpeg | MP4: анимация + озвучка + мастеринг |

Каждый этап запускается отдельно. Или одной кнопкой — полный авто-пайплайн.

---

## Настройка AI-моделей

### OmniVoice (TTS)

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

### WhisperX (forced alignment)

Модели скачиваются автоматически при первом запросе к `/api/v1/audio/sync`.

- `Systran/faster-whisper-base` — базовая транскрипция
- `jonatasgrosman/wav2vec2-large-xlsr-53-russian` — русский язык

---

## Структура проекта

```
Vidora/
├── backend/                        # Python FastAPI
│   ├── app/                        # API, WebSocket, задачи
│   │   ├── api/
│   │   │   ├── audio.py            # TTS, синхронизация, мастеринг
│   │   │   ├── code.py             # Генерация Remotion через Ollama
│   │   │   ├── render.py           # Рендер MP4 через Remotion CLI
│   │   │   └── media.py            # Загрузка, Pexels
│   │   └── main.py                 # FastAPI app, CORS, маршруты
│   └── remotion-project/           # Remotion-сборка React компонентов
├── frontend/                       # Electron + React
│   ├── electron/                   # main.cjs, preload.cjs, build.cjs
│   ├── src/
│   │   ├── entities/project/       # Zustand store, типы
│   │   ├── features/               # File System API
│   │   ├── widgets/                # EditorWorkspace, ProjectCreator
│   │   └── shared/                 # UI-кит, темы, утилиты
│   └── electron-builder.yml        # NSIS/DMG/AppImage конфиг
├── assets/readme/                  # README SVG-визуализации
└── docs/                           # Сценарий, шаблоны
```

## Стек

| Слой | Технологии |
|------|------------|
| **Фронтенд** | React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Zustand 5 |
| **Десктоп** | Electron 43, electron-builder, electron-packager |
| **Бэкенд** | Python 3.11+, FastAPI, WebSockets, uvicorn |
| **AI/ML** | OmniVoice (F5-TTS), WhisperX, Ollama (qwen2.5-coder), PyTorch |
| **Медиа** | FFmpeg, Remotion (React → MP4) |
| **Архитектура** | Feature-Sliced Design (FSD) |

---

## Скрипты

| Команда | Описание |
|---------|----------|
| `pnpm dev` | Vite dev-сервер |
| `pnpm build` | TypeScript + Vite build |
| `pnpm electron:dev` | Electron в dev-режиме (с бэкендом) |
| `pnpm electron:build` | Сборка десктоп установщика |
| `pnpm backend:dev` | FastAPI dev-сервер с --reload |
| `pnpm backend:build` | PyInstaller → standalone backend.exe |
| `pnpm dev:all` | Vite + FastAPI одновременно |

---

**Версия:** v0.1.0 | MIT License
