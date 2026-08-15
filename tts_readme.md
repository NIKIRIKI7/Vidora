# TTS: OmniVoice и CosyVoice3

Документация по двум локальным TTS-движкам: **OmniVoice** (k2-fsa, используется в Vidora по умолчанию) и **CosyVoice3** (FunAudioLLM / qwen-audio).

---

## OmniVoice

### Обзор

**OmniVoice** — массово-мультиязычная zero-shot TTS-модель от k2-fsa, поддерживает **600+ языков**. Архитектура — diffusion language model (DLM-style): качественный синтез с высокой скоростью инференса (RTF до 0.025). Ключевые возможности:

- **Клонирование голоса** по короткому референс-аудио (3–10 сек), без текстовой расшифровки — модель сама транскрибирует через Whisper ASR.
- **Дизайн голоса** по атрибутам (пол, возраст, высота тона, стиль, акцент) без референса.
- Встроенный ASR для авторасшифровки референса.
- Управление невербальными символами и коррекция произношения.

Репозиторий: <https://github.com/k2-fsa/OmniVoice>, HuggingFace: `k2-fsa/OmniVoice`.

> **Ограничение дизайна голоса:** модель обучалась в основном на клонировании — это самый стабильный режим. Voice design обучен только на китайском и английском; для других языков результат может быть нестабильным.

### Установка

```bash
# Стабильный релиз с PyPI
pip install omnivoice

# Последняя версия с GitHub без клонирования
pip install git+https://github.com/k2-fsa/OmniVoice.git

# Для разработки (клонировать и поставить editable)
git clone https://github.com/k2-fsa/OmniVoice.git
cd OmniVoice
pip install -e .

# Опционально: текстовый нормализатор чисел (WeTextProcessing, "123" → "one hundred twenty-three")
pip install "omnivoice[tn]"
```

### Загрузка модели

```python
import torch
from omnivoice import OmniVoice

model = OmniVoice.from_pretrained(
    "k2-fsa/OmniVoice",      # или локальный путь к снэпшоту
    device_map="cuda:0",     # "cpu" | "mps" (Apple Silicon) | "xpu" (Intel Arc)
    dtype=torch.float16,     # float32 на CPU
    load_asr=True,           # встроенный Whisper для авторасшифровки референса
)
```

Опции ASR: `asr_model_name` — своя/локальная копия Whisper; `asr_device="cuda:1"` или `"cpu"` — управление устройством Whisper (напр. вторая GPU или CPU при дефиците VRAM).

### Скачивание весов в Vidora

```bash
cd backend
python -c "
from huggingface_hub import snapshot_download
snapshot_download('k2-fsa/OmniVoice', local_dir='ai-models/OmniVoice')
"
```

Размер: **~3.2 ГБ**, путь: `backend/ai-models/OmniVoice/`. Если локальная папка существует — Vidora загружает модель из неё (см. `audio_provider.py`), иначе тянет с HuggingFace.

### Генерация речи

Параметры передаются **ключевыми аргументами** `model.generate(...)` **или объектом** `OmniVoiceGenerationConfig`:

```python
# 1) Напрямую
audio = model.generate(text="Hello world", num_step=32, guidance_scale=2.0)

# 2) Через dataclass
from omnivoice import OmniVoiceGenerationConfig
config = OmniVoiceGenerationConfig(num_step=32, guidance_scale=2.0)
audio = model.generate(text="Hello world", generation_config=config)
```

Возврат — список `np.ndarray` формы `(T,)` на частоте **24 кГц**. Сохранение:

```python
import soundfile as sf
sf.write("out.wav", audio[0], 24000)
```

#### Параметры декодирования

| Параметр | По умолч. | Описание |
|---|---|---|
| `num_step` | 32 | Итераций итеративного unmasking. Больше — качественнее, но медленнее. 16 — для быстрого инференса |
| `denoise` | `True` | Добавляет токен `<\|denoise\|>` — более чистая речь |
| `guidance_scale` | 2.0 | Classifier-free guidance |
| `t_shift` | 0.1 | Сдвиг временно́го шага noise schedule; меньше — акцент на ранние шаги декодирования |
| `speed` | 1.0 | Скорость речи |
| `duration` | — | Целевая длительность в секундах |
| `normalize_text` | `False` | Нормализация чисел словами (нужен extra `omnivoice[tn]`) |

### Клонирование голоса (zero-shot)

```python
audio = model.generate(
    text="Hello, this is a test of zero-shot voice cloning.",
    ref_audio="ref.wav",
    ref_text="Transcription of the reference audio.",  # можно опустить — модель транскрибирует сама
)
```

Советы:

- Референс **3–10 секунд**. Длиннее — медленнее инференс и хуже качество клонирования.
- Для чистого произношения используйте референс **на том же языке**, что и целевая речь. В кросс-язычном клонировании у результата будет акцент языка референса.
- Для арабских цифр — нормализуйте в слова (или `normalize_text=True`). Китайский/английский — через WeTextProcessing, остальные языки — `num2words`.
- Inline-управление сохраняется: `[laughter]`, `[B EY1 S]`, тоны пиньиня.
- macOS (Apple Silicon): у `pynini` нет wheel — `conda install -c conda-forge pynini`.

#### Переиспользование клона между сессиями

Закодируйте референс один раз в промпт и сохраните — в следующих сессиях не нужны загрузка аудио и авторасшифровка:

```python
prompt = model.create_voice_clone_prompt(
    ref_audio="ref.wav",
    ref_text="Transcription of the reference audio.",
)
prompt.save("my_voice.pt")

# В новой сессии:
from omnivoice import VoiceClonePrompt
prompt = VoiceClonePrompt.load("my_voice.pt")
audio = model.generate(text="Hello again!", voice_clone_prompt=prompt)
```

### Дизайн голоса (без референса)

```python
audio = model.generate(
    text="Hello, this is a test of zero-shot voice design.",
    instruct="female, low pitch, british accent",
)
```

Атрибуты — через запятую, свободно комбинируются: **пол** (male/female), **возраст** (child → elderly), **высота** (very low → very high), **стиль** (whisper), **акцент** английский (American, British...), **диалект** китайский (四川话, 陕西话...).

### Как это использует Vidora

Виджета в `backend/app/services/audio_provider.py` (`OmniVoiceProvider`):

- Кэш модели: `_model` загружается один раз; `unload_model()` освобождает VRAM.
- Голоса из UI (`aria`, `marcus`, `nova`) маппятся на инструкцию дизайна (`_VOICE_MAP`), `clone` — на `create_voice_clone_prompt`.
- `generate_tts` умеет `num_steps`, `guidance_scale`, `speed`, `duration`, `denoise`, `preprocess_prompt`, `postprocess_output`.
- Синхронный `model.generate` гоняется в `ThreadPoolExecutor` (не блокирует asyncio).
- Выходной WAV: моно, int16, частота из `model.sampling_rate` (24000).
- Если нет GPU — автоматически `cpu` + `float32`; отсутствие модели не маскируется, выбрасывается понятная ошибка.

---

## CosyVoice3

### Обзор

**Fun-CosyVoice 3.0** (обозначается как **CosyVoice3**, модель `Fun-CosyVoice3-0.5B`) — TTS на базе LLM от FunAudioLLM (qwen-audio). Значительный скачок против предыдущих версий по **консистентности контента**, **схожести спикера** и **естественности просодии**. Спроектирована для zero-shot мультиязычного синтеза.

Репозиторий: <https://github.com/qwenaudio/CosyVoice> (он же FunAudioLLM/CosyVoice), HuggingFace/ModelScope: `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`.

### Ключевые возможности

- **9 языков** + **18+ китайских диалектов и акцентов**.
- Мультиязычное и **кросс-языковое** zero-shot клонирование голоса.
- **Instruct-режим** (`inference_instruct2`): управление стилем, эмоцией, скоростью, громкостью естественным языком через `instruct_text`.
- **Произношение через inpainting**: пиньинь (китайский) и CMU-фонемы (английский).
- **Встроенная текстовая нормализация** чисел и спецсимволов — отдельный фронтенд не нужен.
- Стриминг (`stream=True`), контроль скорости.

### Установка и загрузка весов

**Внимание:** CosyVoice3 работает только с `transformers==4.51.3` — на `transformers>=5`
инкрементальный KV-cache декод Qwen2 ломается (генерится мусор/петли). OmniVoice же требует
`transformers>=5.3.0`. Поэтому CosyVoice3 запускается в **отдельном venv** (`backend/venv-cosyvoice`)
как subprocess-worker (`cosyvoice_worker.py`), а основной venv не трогается.

```sh
# 1) Создать venv-cosyvoice (наследует torch/torchaudio/onnxruntime из основного venv)
python -m venv backend/venv-cosyvoice

# 2) Прокинуть site-packages основного venv (чтобы не качать torch заново)
python - <<'PY'
import sysconfig
pure = sysconfig.get_paths()['purelib']  # C:\...\backend\.venv\Lib\site-packages
open(r'backend\venv-cosyvoice\Lib\site-packages\_main_venv.pth', 'w', encoding='utf-8').write(pure)
PY

# 3) Поставить пиновый transformers (перекрывает 5.x из основного venv)
backend\venv-cosyvoice\Scripts\pip.exe install "transformers==4.51.3" --index-url https://pypi.org/simple
```

Клонирование кода CosyVoice:

```sh
git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
cd CosyVoice
git submodule update --init --recursive
```

Загрузка весов CosyVoice3:

```python
# ModelScope (китайские пользователи)
from modelscope import snapshot_download
snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512', local_dir='pretrained_models/Fun-CosyVoice3-0.5B')

# HuggingFace (остальной мир)
from huggingface_hub import snapshot_download
snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512', local_dir='pretrained_models/Fun-CosyVoice3-0.5B')
```

В репозитории также доступны более старые веса: `CosyVoice2-0.5B`, `CosyVoice-300M`, `CosyVoice-300M-SFT`, `CosyVoice-300M-Instruct`, `CosyVoice-ttsfrd`.

### Инференс: instruct-режим

`inference_instruct2(tts_text, instruct_text, prompt_wav, zero_shot_spk_id='', stream=False, speed=1.0, text_frontend=True)`

- `tts_text` — текст для озвучки.
- `instruct_text` — инструкция стиля/эмоции/скорости/диалекта, **обязательно заканчивается** `<|endofprompt|>`.
- `prompt_wav` — путь к WAV-референсу голоса (zero-shot промпт).
- Возвращает генератор словарей `{'tts_speech': Tensor}`; частота — `cosyvoice.sample_rate`.

```python
from cosyvoice.cli.cosyvoice import AutoModel
import torchaudio

cosyvoice = AutoModel(model_dir='pretrained_models/Fun-CosyVoice3-0.5B')

# Диалект (кантонский): "请用广东话表达"
for i, j in enumerate(cosyvoice.inference_instruct2(
    '好少咯，一般系放嗰啲国庆啊，中秋嗰啲可能会咯。',
    'You are a helpful assistant. 请用广东话表达。<|endofprompt|>',
    './asset/zero_shot_prompt.wav', stream=False)):
    torchaudio.save('instruct_{}.wav'.format(i), j['tts_speech'], cosyvoice.sample_rate)

# Скорость: "请用尽可能快地语速说一句话"
for i, j in enumerate(cosyvoice.inference_instruct2(
    '收到好友从远方寄来的生日礼物...',
    'You are a helpful assistant. 请用尽可能快地语速说一句话。<|endofprompt|>',
    './asset/zero_shot_prompt.wav', stream=False)):
    torchaudio.save('instruct_{}.wav'.format(i), j['tts_speech'], cosyvoice.sample_rate)
```

> Полный список поддерживаемых инструкций управления — в `cosyvoice/utils/common.py`.

### Кросс-языковое клонирование

Как и OmniVoice, CosyVoice3 клонирует голос по короткому промпт-аудио и говорит на целевом языке, сохраняя тембр спикера. Отличие — акцент: клонируемый голос получается через `prompt_wav`, а контроль стиля — через `instruct_text`.

---

## Сравнение: OmniVoice vs CosyVoice3

| Критерий | OmniVoice | CosyVoice3 (Fun-CosyVoice 3.0) |
|---|---|---|
| Автор | k2-fsa | FunAudioLLM (qwen-audio) |
| Языки | **600+** | 9 основных + 18+ китайских диалектов |
| Архитектура | Diffusion LM | LLM-based (токеновый авторегрессионный) |
| Скорость | RTF до 0.025 | зависит от аппаратуры, стриминг поддерживается |
| Клонирование | `ref_audio` + `create_voice_clone_prompt` | `prompt_wav` zero-shot |
| Дизайн голоса | Да, по атрибутам (`instruct=`) | Нет; вместо этого — естественно-языковая инструкция стиля (`instruct_text`) |
| Управление стилем | Невербальные символы `[laughter]` и т.п. | NL-инструкции: эмоция, скорость, громкость, диалект |
| Нормализация чисел | `normalize_text=True` (extra `[tn]`) | Встроенная, отдельный фронтенд не нужен |
| Расшифровка референса | Встроенный Whisper ASR | — |
| Формат вывода | `np.ndarray` 24 кГц | Tensor, `cosyvoice.sample_rate` |
| Интеграция в Vidora | ✅ по умолчанию (`OmniVoiceProvider`) | Не подключена |

### Когда что выбирать

- **OmniVoice** — если нужен максимум языков (600+) и/или дизайн голоса без референса. Это дефолт Vidora.
- **CosyVoice3** — если приоритеты: русский/английский + китайские диалекты, естественно-языковое управление стилем (эмоция/скорость/громкость одной фразой), встроенная нормализация и стриминг.

Обе модели — локальные, без внешних API. Виджеты для добавления CosyVoice3 в Vidora пока нет: потребуется провайдер, обёртывающий `AutoModel(...)` + `inference_instruct2` аналогично `OmniVoiceProvider`.

---

## CosyVoice3 в Vidora

Провайдер `CosyVoiceProvider` (в `audio_provider.py`) не импортирует cosyvoice напрямую — он
запускает `cosyvoice_worker.py` в `backend/venv-cosyvoice` и общается с ним по строкам JSON
(stdin/stdout). Модель в worker'е живёт постоянно и перезапускается при падении. Выгрузка —
через `unload_model()` (шлёт `{"shutdown": true}` и ждёт выхода).

Диагностика проблемы «CosyVoice3 генерит чушь»: на `transformers 5.x` расхождение между
пошаговым декодом и полным прогоном достигает 2.5+ (норма — ~0), на `4.51.3` — машинная точность.
