# Vidora Local ML Worker (TTS Engine)

Этот микросервис отвечает за выполнение тяжелых ML-задач (синтез речи, клонирование голоса), используя графический процессор (VRAM). Он работает в паре с основным C# монолитом `Vidora` (для C# это просто **LocalTts** — локальный ML-воркер).

**Главный принцип — архитектура Stateless.** C# оркестратор передаёт сюда абсолютные пути к файлам. Микросервис читает файлы с диска, генерирует звук/векторы и кладёт их обратно на диск. Микросервис не содержит базы данных и не хранит состояние между запросами (кроме одной загруженной модели в VRAM).

**Движок — OmniVoice (k2-fsa) на PyTorch.** Единственный поддерживаемый режим: официальный чекпоинт `k2-fsa/OmniVoice` (fp16/int8/fp32). GGUF/CrispASR-режим удалён.

---

## OmniVoice на PyTorch (основной режим)

Адаптер (`adapters/omni_voice_adapter.py`) поднимает официальный чекпоинт `k2-fsa/OmniVoice` через пакет `omnivoice`:

| Компонент | Назначение |
|-----------|-----------|
| `model.safetensors` (~2.4 GB) | Qwen3-бэкбон + audio embeddings/heads |
| `audio_tokenizer/model.safetensors` (~0.8 GB) | HiggsAudioV2 audio-codec (HuBERT + DAC) |
| `tokenizer.json`, `config.json`, ... | токенизатор и конфиги |

Скачивание в `<TTS_MODELS_DIR>/OmniVoice` (по умолчанию `python_services/tts_engine/ai-models/OmniVoice`):

```bash
python -c "from huggingface_hub import snapshot_download; snapshot_download('k2-fsa/OmniVoice', local_dir=r'python_services/tts_engine/ai-models/OmniVoice')"
```

Порядок поиска чекпоинта в адаптере:
1. `OMNIVOICE_CHECKPOINT` (точный путь к локальному каталогу или HF-репозиторий);
2. `<TTS_MODELS_DIR>/OmniVoice`;
3. сам `<TTS_MODELS_DIR>` (если в его корне лежит `config.json`);
4. `k2-fsa/OmniVoice` (репозиторий на Hugging Face — скачается на ходу);
5. при `OMNIVOICE_QUANTIZE=int8` — предквантованный `kawshikbuet17/OmniVoice-int8-bnb`.

Полезные переменные: `OMNIVOICE_QUANTIZE` (`auto`/`fp16`/`bf16`/`int8`/`fp32`),
`OMNIVOICE_STEPS` (шаги диффузии), `OMNIVOICE_GUIDANCE`, `OMNIVOICE_VOICE`
(профиль голоса без клонирования).

Клонирование строит **voice clone prompt** (`create_voice_clone_prompt`) из
reference-WAV и сохраняет его на диск в `.pt` (`prompt.save`). При синтезе воркер
поднимает `.pt` обратно (`VoiceClonePrompt.load`) — C# передаёт путь в
`speaker_embedding_path`.

> **Текст эталона (reference_text) обязателен.** Если он не передан, воркер
> бросает ошибку: ASR внутри Python не используется. Транскрипцию эталона
> выполняет C# (`VoiceModule`) нативным `FasterWhisper.NET` и всегда передаёт
> `reference_text`.

> **torch>=2.6.** В `torch.load` по умолчанию `weights_only=True`. Современные
> `.pt` (plain dict) грузятся штатно; для старых чекпоинтов адаптер использует
> `torch.serialization.safe_globals([VoiceClonePrompt])`, а при необходимости —
> фоллбэк `weights_only=False`.

---

## Установка и запуск

1. Перейдите в папку сервиса:
   ```bash
   cd python_services/tts_engine
   ```
2. Создайте виртуальное окружение и установите зависимости:
   ```bash
   python -m venv venv
   source venv/bin/activate          # Linux/macOS
   venv\Scripts\activate             # Windows
   pip install -r requirements.txt
   ```
   Для CUDA-сборки PyTorch (NVIDIA, Windows/Linux) — torch и torchaudio ставятся
   с индекса `cu128` и должны совпадать по версии:
   ```bash
   pip install torch==2.11.0+cu128 torchaudio==2.11.0+cu128 --index-url https://download.pytorch.org/whl/cu128
   ```
   > CUDA-колёса 2.11 — последняя версия torchaudio на индексе `cu128`. Более новый
   > `torch` без соответствующего `torchaudio` ломает `libtorchaudio.pyd`.
3. Запуск сервера локально:
   ```bash
   python main.py
   ```
   Сервер запустится на `http://127.0.0.1:8000`. Проверка: `GET /health`.

Для продакшена без автоперезагрузки:
   ```bash
   uvicorn main:app --host 127.0.0.1 --port 8000
   ```

---

## Конфигурация через переменные окружения

| Переменная               | По умолчанию      | Описание                                                        |
|--------------------------|-------------------|-----------------------------------------------------------------|
| `TTS_MODELS_DIR`         | `python_services/tts_engine/ai-models` | Каталог с локальными весами. Модель ищется в `<dir>/OmniVoice`. |
| `AI_MODELS_DIR`          | —                 | Альтернативный каталог (наследие C# конфига `ai-models`).       |
| `OMNIVOICE_CHECKPOINT`   | —                 | Точный путь к чекпоинту или HF-репозиторий (по умолчанию `k2-fsa/OmniVoice`). |
| `OMNIVOICE_QUANTIZE`     | `auto`            | `auto` / `fp16` / `bf16` / `int8` / `fp32`. `auto` → fp16 на CUDA, fp32 на CPU. |
| `OMNIVOICE_VOICE`        | `nova`            | Дефолтный профиль голоса для синтеза без клонирования.           |
| `OMNIVOICE_STEPS`        | `32`              | Количество шагов диффузии.                                       |
| `OMNIVOICE_GUIDANCE`     | `3.0`             | Guidance scale.                                                  |

Пример запуска с локальным чекпоинтом и int8-квантованием:
```bash
$env:TTS_MODELS_DIR = "C:\Models"
$env:OMNIVOICE_QUANTIZE = "int8"
python main.py
```

> **Мало VRAM (например, 4 ГБ ноутбучной RTX 3050).** fp16-чекпоинт занимает
> ~1.9 ГБ и нормально укладывается. Если всё же ловите OOM — используйте
> `OMNIVOICE_QUANTIZE=int8` (`pip install bitsandbytes`) либо CPU-fallback
> `OMNIVOICE_QUANTIZE=fp32`.

---

## HTTP API

| Метод  | Путь                   | Описание                                                              |
|--------|------------------------|-----------------------------------------------------------------------|
| GET    | `/health`              | Проверка живости воркера.                                              |
| GET    | `/api/v1/models`       | Дискавери движков (C# бэкенд забирает отсюда список для UI).          |
| POST   | `/api/v1/synthesize`   | Синтез речи в `output_audio_path` (абсолютный путь).                   |
| POST   | `/api/v1/clone`        | Клонирование голоса → вектор `.pt` в `output_embedding_path`.         |
| POST   | `/api/v1/vram/unload`  | Принудительная выгрузка модели из VRAM.                                |

Ключевые поля запросов:

- `engine_id` — идентификатор движка из `GET /api/v1/models` (сейчас `omni_voice_v1`);
- `text` — текст для озвучки;
- `speaker_embedding_path` — путь к вектору голоса (`.pt`), если синтезируем клоном;
- `reference_audio_path` + `reference_text` — эталон диктора для клонирования;
- `speed` / `pitch` — скорость и высота тона (pitch движком OmniVoice не поддерживается и игнорируется с предупреждением в лог).

---

## Как это работает внутри

```
C# монолит  --HTTP-->  FastAPI main.py  -->  VramManager  -->  Adapter (OmniVoice)
                        |                        |                  |
                    валидация схем          ленивая загрузка     реальный вызов
                        |                  и вытеснение из VRAM    модели
                        |                        |
                     .wav / .pt пишутся на диск по абсолютным путям
```

- **Реестр адаптеров** (`adapters/__init__.py`) — список доступных моделей. `REGISTRY` строится из `AVAILABLE_ADAPTERS`, чтобы C# мог динамически обнаруживать движки.
- **VRAM-менеджер** (`core/vram_manager.py`) — держит в памяти ровно один движок. При запросе другого — выгружает текущий, чистит кэш CUDA и поднимает новый. Имеет синглтон-инстанс и thread-safe лок.
- **Адаптеры** (`adapters/`) — реализуют контракт `BaseVoiceEngine` и прячут детали конкретной модели.

---

## 🛠 Как добавить новую модель (например, F5-TTS)?

Архитектура построена на паттерне **"Адаптер"**. Чтобы добавить новый TTS-движок, не нужно менять ядро или API-роутеры.

### Шаг 1. Создайте файл адаптера
В папке `adapters/` уже лежит заготовка `f5_tts_adapter.py`. Откройте её и наследуйтесь от `BaseVoiceEngine`, определив `engine_id`, `name`, `capabilities`:

```python
import torch
import gc
from .base_engine import BaseVoiceEngine
# from f5_tts.infer import F5Model  # импорт вашей модели

class F5TTSAdapter(BaseVoiceEngine):
    engine_id = "f5_tts_v1"
    name = "F5-TTS (Flow Matching)"
    capabilities = ["synthesis", "clone"]

    def load(self):
        # Выполнится один раз при первом обращении
        self.model = F5Model.from_pretrained("...")

    def unload(self):
        # Выполнится, когда C# прикажет освободить VRAM
        self.model = None
        torch.cuda.empty_cache()
        gc.collect()

    def clone_voice(self, ref_audio_path, output_embedding_path, ref_text=None):
        # 1. Загружаете аудио ref_audio_path
        # 2. Извлекаете вектор/параметры диктора
        # 3. Сохраняете через torch.save(embedding, output_embedding_path)
        pass

    def synthesize(self, text, embedding_path, output_path, speed=1.0, pitch=1.0):
        # 1. embedding = torch.load(embedding_path)
        # 2. Генерируете аудио
        # 3. Сохраняете .wav в output_path
        pass
```

### Шаг 2. Зарегистрируйте адаптер в реестре
В файле `adapters/__init__.py` раскомментируйте класс в списке `AVAILABLE_ADAPTERS`:

```python
from .omni_voice_adapter import OmniVoiceAdapter
from .f5_tts_adapter import F5TTSAdapter  # <--- ваш адаптер

AVAILABLE_ADAPTERS = [
    OmniVoiceAdapter,
    F5TTSAdapter,                        # <--- добавьте сюда
]
```

**Всё готово!** При следующем запросе C# монолит получит список из `GET /api/v1/models`, увидит движок `f5_tts_v1` и отобразит его в UI. VRAM-менеджер автоматически вытеснит текущую модель, когда придёт запрос на новый движок.
