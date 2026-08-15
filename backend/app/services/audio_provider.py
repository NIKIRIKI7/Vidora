import os
import re
import wave
import struct
import asyncio
import concurrent.futures
import logging
import subprocess
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional
import numpy as np
import httpx

# DOTALL + строгий ограничитель [^\]]+ — переносы строк и мусор в тегах не ломают парсер
_EMOTION_TAG_RE = re.compile(r'\[emotion:\s*([^\]]+)\]', re.IGNORECASE | re.DOTALL)
_INSTRUCT_TAG_RE = re.compile(r'\[instruct:\s*([^\]]+)\]', re.IGNORECASE | re.DOTALL)
_PAUSE_TAG_RE = re.compile(r'<#([0-9.]+)#>')
_SOUND_TAG_RE = re.compile(r'\((breath|inhale|exhale|sighs|chuckle|laughs|clear-throat|emm|coughs|groans|gasps|sniffs)\)', re.IGNORECASE | re.DOTALL)

# ponytail: 2.8-hd не поддерживает whisper/fluent (это 2.6) — держим строгий набор для нашей модели
_MINIMAX_EMOTIONS = frozenset({"happy", "sad", "angry", "fearful", "disgusted", "surprised", "calm"})
_LOCAL_SPEAKERS = frozenset({"aria", "marcus", "nova", "kolya", "kseniya", "alloy", "clone"})
MINIMAX_DEFAULT_VOICE = "Russian_ReliableMan"


def split_emotion_tag(text: str):
    """Вытаскивает '[emotion: calm]' из текста: (текст_без_тега, эмоция | None).
    Невалидная эмоция тоже вырезается из текста — иначе диктор произнесёт её вслух."""
    match = _EMOTION_TAG_RE.search(text)
    if not match:
        return text, None
    clean_text = _EMOTION_TAG_RE.sub('', text).strip()
    emotion = match.group(1).lower()
    return clean_text, emotion if emotion in _MINIMAX_EMOTIONS else None


def clean_voice_tags(text: str) -> str:
    """Убирает теги озвучки ([emotion: x], [instruct: ...], <#1.5#>, (sighs)) и случайно
    попавшие визуальные ремарки *(...)* — для Whisper-синхронизации, где их быть не должно."""
    # ponytail: защита от битых фрагментов — *(...)* это ремарка режиссёра, не текст для озвучки
    text = re.sub(r'\*\([\s\S]*?\)\*', ' ', text or '')
    text = _EMOTION_TAG_RE.sub('', text)
    text = _INSTRUCT_TAG_RE.sub('', text)
    text = re.sub(r'<#[\d.]+#>', '', text)
    text = re.sub(r'\([a-z][a-z-]*\)', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def extract_instruct_tag(text: str):
    """Вытаскивает '[instruct: ...]' из текста: (текст_без_тега, инструкция | None)."""
    match = _INSTRUCT_TAG_RE.search(text)
    if not match:
        return text, None
    return _INSTRUCT_TAG_RE.sub('', text).strip(), match.group(1).strip()


def to_s2_text(text: str, design_prompt: str | None = None) -> str:
    """Конвертит текст под Fish Audio S2: нативный синтаксис S2 — инлайн-теги [tag].
    <#1.5#> -> [pause]; (sighs)-скобки вырезаются (у S2 есть свои [sigh]/[laughing]);
    [emotion: x]/[instruct: y] (на случай прямого вызова API) сворачиваются в [x]/[y];
    design_prompt подставляется ведущим тегом (S2 поддерживает free-form теги)."""
    text = text or ''
    text = re.sub(r'\*\([\s\S]*?\)\*', ' ', text)
    text = _INSTRUCT_TAG_RE.sub(lambda m: f"[{m.group(1).strip()}]", text)
    text = _EMOTION_TAG_RE.sub(lambda m: f"[{m.group(1).strip()}]", text)
    text = re.sub(r'<#[\d.]+#>', '[pause]', text)
    text = re.sub(r'\([a-z][a-z-]*\)', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    if design_prompt and design_prompt.strip():
        text = f"[{design_prompt.strip()}] {text}".strip()
    return text


def trim_ref_audio_for_clone(ref_audio_path: str, max_seconds: float = 10.0) -> str:
    """Обрезает аудио-референс для клонирования до ~10с по границе слова (Whisper),
    чтобы фразы не обрывались на полуслове. Кэширует результат в temp; возвращает путь к WAV."""
    if not ref_audio_path or not os.path.exists(ref_audio_path):
        return ref_audio_path
    import subprocess
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", ref_audio_path],
            capture_output=True, text=True,
        )
        dur = float(out.stdout.strip())
    except Exception:
        return ref_audio_path
    if dur <= max_seconds:
        return ref_audio_path

    import hashlib, tempfile
    key = hashlib.md5((ref_audio_path + str(os.path.getmtime(ref_audio_path))).encode("utf-8")).hexdigest()[:12]
    cache = os.path.join(tempfile.gettempdir(), f"cosy_ref_{key}.wav")
    if os.path.exists(cache):
        return cache

    cut_at = max_seconds
    try:
        import torch
        from faster_whisper import WhisperModel
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        model_dir = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "ai-models"))
        model = WhisperModel("Systran/faster-whisper-small", device=device, compute_type=compute_type, download_root=model_dir)
        segments, _info = model.transcribe(ref_audio_path, word_timestamps=True, language="ru", vad_filter=True)
        words = [w for seg in segments for w in seg.words]
        for w in reversed(words):
            if w.end and 3.0 <= w.end <= max_seconds:
                cut_at = w.end
                break
        del model
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception as e:
        print(f"[CosyVoice] trim: Whisper-таймкоды недоступны ({e}), режу на {max_seconds:.1f}s")

    try:
        subprocess.run(
            ["ffmpeg", "-y", "-i", ref_audio_path, "-t", f"{cut_at:.2f}", "-ar", "16000", cache],
            capture_output=True, check=False,
        )
        if os.path.exists(cache):
            return cache
    except Exception:
        pass
    return ref_audio_path


class BaseTTSProvider(ABC):
    @abstractmethod
    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        pass

class LocalMockTTSProvider(BaseTTSProvider):
    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        await asyncio.sleep(2.0)
        sample_rate = 24000
        duration = kwargs.get("duration", 0.0)
        dur = duration if duration > 0 else max(len(text) * 0.08, 1.0)
        num_samples = int(dur * sample_rate)
        output_path = kwargs.get("output_path", "")
        if output_path:
            with wave.open(output_path, 'w') as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(struct.pack('h', 0) * num_samples)

class OmniVoiceProvider(BaseTTSProvider):
    _model = None
    _thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    _VOICE_MAP = {
        "aria": "female, young adult, moderate pitch",
        "marcus": "male, middle-aged, low pitch",
        "nova": "female, young adult, high pitch",
    }

    @classmethod
    def unload_model(cls):
        if cls._model is not None:
            del cls._model
            cls._model = None
            import gc, torch
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    @classmethod
    def _load_model(cls):
        import torch
        from omnivoice import OmniVoice
        logging.getLogger('omnivoice').setLevel(logging.INFO)
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        local_path = os.path.join(os.path.dirname(__file__), "..", "..", "ai-models", "OmniVoice")
        local_path = os.path.normpath(local_path)
        checkpoint = local_path if os.path.exists(local_path) else "k2-fsa/OmniVoice"
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        return OmniVoice.from_pretrained(
            checkpoint,
            device_map=device,
            dtype=dtype,
            load_asr=True,
            token=False,
        )

    @classmethod
    def _get_model(cls):
        if cls._model is None:
            try:
                cls._model = cls._load_model()
            except Exception as e:
                import traceback
                traceback.print_exc()
                # Больше никакого тихого MOCK. Выбрасываем понятную ошибку.
                raise RuntimeError(f"Сбой инициализации модели OmniVoice: {e}")
        return cls._model

    # ponytail: **kwargs absorbs all signature changes silently, no unexpected arguments ever again.
    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        model = self._get_model()

        from omnivoice import OmniVoiceGenerationConfig
        
        num_steps = kwargs.get("num_steps", 32)
        guidance_scale = kwargs.get("guidance_scale", 3.0)
        speed = kwargs.get("speed", 1.0)
        duration = kwargs.get("duration", 0.0)
        denoise = kwargs.get("denoise", True)
        preprocess_prompt = kwargs.get("preprocess_prompt", True)
        postprocess_output = kwargs.get("postprocess_output", True)
        
        gen_config = OmniVoiceGenerationConfig(
            num_step=num_steps,
            guidance_scale=guidance_scale,
            denoise=denoise,
            preprocess_prompt=preprocess_prompt,
            postprocess_output=postprocess_output,
        )

        text, inline_instruct = extract_instruct_tag(text)
        text = clean_voice_tags(text)
        if not text:
            raise RuntimeError(
                "Текст для озвучки пуст (возможно, он содержит только визуальную ремарку). "
                "Перейдите во вкладку '📝 Raw Script' и сделайте пробел для перепарсинга."
            )

        gen_kwargs = dict(
            text=text.strip(),
            generation_config=gen_config,
        )
        if speed != 1.0:
            gen_kwargs["speed"] = speed
        if duration > 0.0:
            gen_kwargs["duration"] = duration

        if voice_model == "clone":
            ref_audio_path = kwargs.get("ref_audio_path")
            if not ref_audio_path:
                raise ValueError("Для клонирования требуется референсное аудио.")
            gen_kwargs["voice_clone_prompt"] = model.create_voice_clone_prompt(
                ref_audio=ref_audio_path,
                ref_text=kwargs.get("ref_text") or None,
            )
        else:
            gen_kwargs["instruct"] = inline_instruct or kwargs.get("design_prompt") or self._VOICE_MAP.get(voice_model, f"{voice_model}")

        loop = asyncio.get_event_loop()
        audio_list = await loop.run_in_executor(
            self._thread_pool, lambda: model.generate(**gen_kwargs)
        )
        waveform = audio_list[0].squeeze()
        if hasattr(waveform, 'numpy'):
            waveform = waveform.numpy()
        waveform_int16 = (waveform * 32767).astype(np.int16)

        output_path = kwargs.get("output_path", "")
        if output_path:
            with wave.open(output_path, "w") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(model.sampling_rate if hasattr(model, 'sampling_rate') else 24000)
                wav.writeframes(waveform_int16.tobytes())

# =====================================================================
# Локальный LLM TTS через subprocess: Qwen3-TTS / MOSS-TTS.
# Каждый движок живёт в своём venv (.venv-qwen / .venv-moss), т.к. их
# зависимости (transformers 4.x / 5.0) несовместимы с основным venv.
# Генерация запускает worker-скрипт tts_worker.py в отдельном процессе.
# =====================================================================
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_TTS_WORKER = Path(__file__).resolve().parent / "tts_worker.py"
_QWEN_PYTHON = _BACKEND_DIR / ".venv-qwen" / "Scripts" / "python.exe"
_MOSS_PYTHON = _BACKEND_DIR / ".venv-moss" / "Scripts" / "python.exe"

_LOCAL_TTS_ENGINES = {
    "qwen-tts/voice-design": {"engine": "qwen", "python": _QWEN_PYTHON, "model": "ai-models/Qwen3-TTS-VoiceDesign", "mode": "design"},
    "qwen-tts/clone": {"engine": "qwen", "python": _QWEN_PYTHON, "model": "ai-models/Qwen3-TTS-Base", "mode": "clone"},
    "qwen-tts/custom-voice": {"engine": "qwen", "python": _QWEN_PYTHON, "model": "ai-models/Qwen3-TTS-CustomVoice", "mode": "custom"},
    "moss-tts/local": {"engine": "moss", "python": _MOSS_PYTHON, "model": "ai-models/MOSS-TTS-Local-Transformer", "mode": "moss", "codec": "ai-models/MOSS-Audio-Tokenizer"},
}
# ponytail: спикеры CustomVoice нативные к кит./англ. — приблизительное сопоставление для ru
_QWEN_SPEAKERS = {
    "aria": "Vivian", "nova": "Serena", "marcus": "Uncle_Fu",
    "kolya": "Ryan", "kseniya": "Vivian", "alloy": "Ryan",
}
# Базовые голоса (aria/marcus/nova) могут клонироваться из заготовленных WAV-референсов
_SPEAKERS_DIR = str(_BACKEND_DIR / "ai-models" / "speakers")


def resolve_clone_reference(voice_model: str, ref_audio_path, ref_text):
    """Возвращает (ref_audio, ref_text) для voice-clone. Базовые голоса (aria/marcus/nova)
    падают на заготовленный WAV-референс из ai-models/speakers/, если пользовательский не задан."""
    if ref_audio_path:
        return ref_audio_path, ref_text
    speaker_wav = os.path.join(_SPEAKERS_DIR, f"{voice_model}.wav")
    if os.path.exists(speaker_wav):
        return speaker_wav, ref_text
    raise ValueError(
        f"Для voice-clone нужен ref_audio_path (референсное аудио), либо положите {voice_model}.wav в {_SPEAKERS_DIR}"
    )


class LocalLLMTTSProvider(BaseTTSProvider):
    _thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    def __init__(self, engine: str, python: Path, model: str, mode: str, codec: str = None):
        self.engine = engine
        self.python = python
        self.model = model
        self.mode = mode
        self.codec = codec

    @classmethod
    def unload_model(cls):
        # ponytail: модель живёт в отдельном subprocess — выгружается при его завершении
        pass

    def _generate_sync(self, text: str, voice_model: str, kwargs: dict):
        text = clean_voice_tags(text).strip()
        output_path = kwargs.get("output_path", "")
        args = {
            "engine": self.engine,
            "model-id": str(_BACKEND_DIR / self.model),
            "mode": self.mode,
            "text": text,
            "voice-model": voice_model,
            "language": kwargs.get("language", "Russian"),
            "output": output_path,
        }
        if self.mode == "design":
            instruct = kwargs.get("design_prompt") or kwargs.get("instruct")
            if not instruct:
                raise ValueError("Для voice-design нужен design_prompt (промпт дизайна голоса)")
            args["design-prompt"] = instruct
        elif self.mode == "clone":
            ref_audio, ref_text = resolve_clone_reference(
                voice_model, kwargs.get("ref_audio_path"), kwargs.get("ref_text")
            )
            args["ref-audio"] = ref_audio
            args["ref-text"] = ref_text or ""
        elif self.mode == "custom":
            args["speaker"] = _QWEN_SPEAKERS.get(voice_model, "Vivian")
        elif self.mode == "moss":
            args["codec-path"] = str(_BACKEND_DIR / self.codec)
            # ponytail: MOSS ~10 ГБ — не влезает в 4 ГБ VRAM, форсируем CPU
            args["device"] = "cpu"

        cmd = [str(self.python), str(_TTS_WORKER)]
        for k, v in args.items():
            cmd += [f"--{k}", str(v)]

        res = subprocess.run(cmd, capture_output=True, text=True, timeout=3600, encoding="utf-8", errors="replace")
        if res.returncode != 0:
            raise RuntimeError(f"TTS worker ({self.engine}) failed: {res.stderr.strip()[-600:]}")
    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self._thread_pool, self._generate_sync, text, voice_model, kwargs)
class CosyVoiceProvider(BaseTTSProvider):
    # ponytail: CosyVoice3 генерит чушь под transformers>=5 (ломается инкрементальный
    # KV-cache декод Qwen2 — воспроизводимо: расхождение 2.5+ против полного прогона).
    # Репозиторий пинит transformers==4.51.3, а OmniVoice требует >=5.3.0 — конфликт,
    # поэтому CosyVoice гоняется в отдельном venv (venv-cosyvoice) как subprocess-worker.
    _proc = None
    _thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    @classmethod
    def _paths(cls):
        base = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
        code = os.path.join(base, "ai-models", "CosyVoice")              # git-клон репозитория
        weights = os.path.join(base, "ai-models", "Fun-CosyVoice3-0.5B") # веса
        worker = os.path.join(os.path.dirname(__file__), "cosyvoice_worker.py")
        py = os.path.join(base, "venv-cosyvoice", "Scripts", "python.exe")
        return base, code, weights, worker, py

    @classmethod
    def unload_model(cls):
        proc = cls._proc
        cls._proc = None
        if proc and proc.poll() is None:
            try:
                proc.stdin.write('{"shutdown": true}\n')
                proc.stdin.flush()
                proc.wait(timeout=10)
            except Exception:
                proc.kill()
        print("[VRAM] CosyVoice worker остановлен")

    @classmethod
    def _get_worker(cls):
        # ponytail: worker держит модель и переживает запросы; перезапускается при падении
        if cls._proc is not None and cls._proc.poll() is None:
            return cls._proc
        _, code, weights, worker, py = cls._paths()
        if not os.path.isfile(py):
            raise RuntimeError(
                f"Нет venv-cosyvoice: {py}. Создайте его: python -m venv backend/venv-cosyvoice, "
                "затем pip install transformers==4.51.3 и добавьте .pth на site-packages "
                "основного venv (см. tts_readme.md)."
            )
        if not os.path.isdir(weights):
            raise RuntimeError(
                f"Веса CosyVoice3 не найдены: {weights}. Скачайте модель "
                "FunAudioLLM/Fun-CosyVoice3-0.5B-2512 в backend/ai-models/Fun-CosyVoice3-0.5B."
            )
        import subprocess
        print(f"[CosyVoice] Старт worker ({py})...")
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        cls._proc = subprocess.Popen(
            [py, worker],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None,
            text=True,
            encoding="utf-8",
            bufsize=1,
            env=env,
        )
        # Ждём READY — модель загружена, можно слать джобы; пре-логи инициализации просто эхоим в консоль
        while True:
            line = cls._proc.stdout.readline().strip()
            if line == "READY":
                break
            if not line:
                raise RuntimeError("[CosyVoice] worker умер при старте — смотрите логи процесса")
            if line:
                print(f"[CosyVoice Worker Init] {line}")
        print("[CosyVoice] worker: модель готова")
        return cls._proc

    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        loop = asyncio.get_event_loop()
        ref_audio = kwargs.get("ref_audio_path")
        # ponytail: режем референс ДО старта CosyVoice, чтобы Whisper не подрался с ним за VRAM
        if voice_model == "clone" and ref_audio:
            ref_audio = await loop.run_in_executor(self._thread_pool, trim_ref_audio_for_clone, ref_audio)

        text, inline_instruct = extract_instruct_tag(text)
        text = clean_voice_tags(text)
        instruct = inline_instruct or kwargs.get("design_prompt")
        speed = kwargs.get("speed", 1.0)
        if not text:
            raise RuntimeError(
                "Текст для озвучки пуст (возможно, он содержит только визуальную ремарку). "
                "Перейдите во вкладку '📝 Raw Script' и сделайте пробел для перепарсинга."
            )
        await loop.run_in_executor(
            self._thread_pool,
            self._generate_sync,
            text,
            voice_model,
            ref_audio,
            instruct,
            speed,
            kwargs.get("guidance_scale", 3.0),
            kwargs.get("num_steps", 32),
            kwargs.get("output_path", ""),
        )

    def _generate_sync(self, text, voice_model, ref_audio_path, design_prompt, speed, guidance_scale, num_steps, output_path):
        import json
        # ponytail: CosyVoice3 поддерживает ТОЛЬКО inference_instruct2 — inference_zero_shot падает
        # на assert <|endofprompt|> (LLM требует токен в prompt_text). Голос берётся из prompt_wav,
        # ref_text (транскрипт) для CosyVoice3 не нужен.
        if voice_model == "clone" and (not ref_audio_path or not os.path.exists(ref_audio_path)):
            raise ValueError("Для клонирования CosyVoice требуется аудио-референс (ref_audio_path).")
        if not output_path:
            raise ValueError("CosyVoice требует output_path")

        job = {
            "text": text,
            "design_prompt": design_prompt,
            "ref_audio_path": ref_audio_path,
            "speed": speed,
            "guidance_scale": guidance_scale,
            "num_steps": num_steps,
            "output_path": output_path,
        }
        proc = self._get_worker()
        proc.stdin.write(json.dumps(job, ensure_ascii=False) + "\n")
        proc.stdin.flush()
        line = proc.stdout.readline().strip()
        if not line:
            # worker упал — сбросим и скажем понятно
            self._proc = None
            raise RuntimeError("[CosyVoice] worker прекратил отвечать — проверьте логи процесса")
        result = json.loads(line)
        if not result.get("ok"):
            raise RuntimeError(f"[CosyVoice] worker: {result.get('error')}")

class FishAudioS2Provider(BaseTTSProvider):
    # ponytail: Fish Audio S2 Pro в Vidora загружен как GGUF формата audio.cpp
    # (general.architecture=audiocpp, family=fish_audio) — его не умеет ни llama-cpp-python,
    # ни transformers. Движок audio.cpp (0xShug0/audio.cpp) — «llama.cpp для аудио» на том же
    # ggml: запускаем его сервер (audiocpp_server.exe) с backend=cuda и шлём OpenAI-совместимый
    # POST /v1/audio/speech. Сервер держит модель в памяти; thread_pool из 1 воркера сериализует.
    MODEL_ID = "fish-s2"
    _proc = None
    _base_url = None
    _thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    @classmethod
    def _find_gguf(cls):
        explicit = os.environ.get("VIDORA_S2_MODEL")
        if explicit:
            return explicit
        # ponytail: audio.cpp (узкий fopen) не открывает пути с кириллицей — ищем сначала
        # ASCII-папку ~/ai-models, потом backend/ai-models как fallback.
        home = os.path.join(Path.home(), "ai-models")
        for directory in (home, os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "ai-models"))):
            if not os.path.isdir(directory):
                continue
            for p in sorted(Path(directory).glob("*.gguf")):
                n = p.stem.lower()
                if "s2" in n or "fish" in n:
                    return str(p)
        return None

    @classmethod
    def _prep_ref(cls, path, max_seconds: float = 8.0):
        # ponytail: audio.cpp принимает voice_ref только как WAV (и не читает кириллические пути).
        # Декодируем референс ffmpeg'ом в моно 16-бит WAV во временную ASCII-папку и режем до
        # ~8с: длинный референс даёт «sampling logits produced zero probability mass».
        if not path or not os.path.exists(path):
            return path
        import subprocess, tempfile
        dst = os.path.join(tempfile.gettempdir(), "vidora_s2_ref_" + os.path.splitext(os.path.basename(path))[0] + ".wav")
        subprocess.run(
            ["ffmpeg", "-y", "-i", path, "-t", str(max_seconds), "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", dst],
            capture_output=True, check=False,
        )
        return dst if os.path.exists(dst) and os.path.getsize(dst) > 0 else path

    @staticmethod
    def _trim_ref_text(text, max_chars: int = 120):
        # ponytail: reference_text обязан быть коротким и соответствовать короткому референсу —
        # длинный текст при коротком аудио ломает семплинг. Оставляем только первое предложение.
        if not text:
            return text
        text = text.strip()
        m = re.match(r'[^.!?…]*[.!?…]?', text)
        first = (m.group(0) if m else "").strip()
        return (first or text)[:max_chars].rstrip()

    @classmethod
    def _paths(cls):
        base = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
        exe = os.environ.get("VIDORA_S2_BIN")
        if not exe:
            for d in (os.path.join(Path.home(), "ai-models", "audiocpp"),
                      os.path.join(base, "ai-models", "audiocpp")):
                candidate = os.path.join(d, "audiocpp_server.exe")
                if os.path.isfile(candidate):
                    exe = candidate
                    break
        return cls._find_gguf(), exe

    @classmethod
    def _backend(cls):
        backend = os.environ.get("VIDORA_S2_BACKEND")
        if backend:
            return backend
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
        except Exception:
            pass
        print("[FishAudioS2] CUDA не найдена — переключаюсь на CPU backend")
        return "cpu"

    @classmethod
    def _get_server(cls):
        if cls._proc is not None and cls._proc.poll() is None:
            return cls._base_url
        import subprocess, socket, time, json, tempfile
        gguf, exe = cls._paths()
        if not gguf or not os.path.isfile(gguf):
            raise RuntimeError(
                "Модель Fish Audio S2 Pro (.gguf) не найдена. Положи её в ~/ai-models или "
                "backend/ai-models, либо укажи VIDORA_S2_MODEL."
            )
        if os.name == "nt" and any(ord(c) > 127 for c in gguf):
            raise RuntimeError(
                f"Модель S2 лежит по кириллическому пути ({gguf}) — audio.cpp не открывает такие "
                "пути. Перенеси .gguf в ASCII-папку (например ~/ai-models) и укажи VIDORA_S2_MODEL."
            )
        if not os.path.isfile(exe):
            raise RuntimeError(
                f"Движок audio.cpp не найден ({exe}). Скачай audiocpp-windows-cuda-runtime.zip и "
                "audiocpp-windows-cuda-balance.zip с https://github.com/0xShug0/audio.cpp/releases "
                "и распакуй оба в backend/ai-models/audiocpp/, либо укажи путь в VIDORA_S2_BIN."
            )
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        cfg = {
            "host": "127.0.0.1",
            "port": port,
            "backend": cls._backend(),
            "device": 0,
            "threads": 4,
            "lazy_load": True,
            "models": [{
                "id": cls.MODEL_ID,
                "family": "fish_audio",
                "path": gguf,
                "task": "tts",
                "mode": "offline",
            }],
        }
        cfg_path = os.path.join(tempfile.gettempdir(), "vidora_fish_s2_server.json")
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False)
        print(f"[FishAudioS2] Старт audiocpp_server (backend={cfg['backend']})...")
        cls._proc = subprocess.Popen([exe, "--config", cfg_path])
        cls._base_url = f"http://127.0.0.1:{port}"
        deadline = time.time() + 600
        while time.time() < deadline:
            if cls._proc.poll() is not None:
                cls._proc = None
                raise RuntimeError("[FishAudioS2] audiocpp_server упал при старте — смотрите логи процесса")
            try:
                if httpx.get(f"{cls._base_url}/health", timeout=3.0).status_code == 200:
                    print("[FishAudioS2] сервер готов (модель поднимется лениво при первом запросе)")
                    return cls._base_url
            except httpx.HTTPError:
                pass
            time.sleep(1.0)
        raise RuntimeError("[FishAudioS2] audiocpp_server не поднялся за 10 минут")

    @classmethod
    def unload_model(cls):
        proc = cls._proc
        cls._proc = None
        cls._base_url = None
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=10)
            except Exception:
                proc.kill()
        print("[FishAudioS2] audiocpp_server остановлен")

    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(self._thread_pool, self._generate_sync, text, voice_model, kwargs)

    def _generate_sync(self, text, voice_model, kwargs):
        output_path = kwargs.get("output_path", "")
        text = to_s2_text(text, kwargs.get("design_prompt"))
        if not text:
            raise RuntimeError(
                "Текст для озвучки пуст (возможно, он содержит только визуальную ремарку). "
                "Перейдите во вкладку '📝 Raw Script' и сделайте пробел для перепарсинга."
            )

        ref_audio = kwargs.get("ref_audio_path")
        if voice_model == "clone" and (not ref_audio or not os.path.exists(ref_audio)):
            raise ValueError("Для клонирования S2 нужен аудио-референс (ref_audio_path).")

        # ponytail: S2 не имеет guidance_scale/num_steps/speed/duration — управление стилем
        # идёт инлайн-тегами [tag]. voice_ref — путь к референсу (сервер на той же машине).
        # max_tokens масштабируем по длине текста (~21 семантич. токена/сек речи): короткий текст
        # даёт низкий потолок, иначе модель иногда зацикливается и генерит десятки секунд мусора.
        max_tokens = min(1024, max(200, int(len(text) * 2.0)))
        payload = {
            "model": self.MODEL_ID,
            "input": text,
            "response_format": "wav",
            "max_tokens": max_tokens,
        }
        if voice_model == "clone":
            payload["voice_ref"] = self._prep_ref(ref_audio)
            if kwargs.get("ref_text"):
                payload["reference_text"] = self._trim_ref_text(kwargs["ref_text"])

        base = self._get_server()
        with httpx.Client(timeout=300.0) as client:
            res = client.post(f"{base}/v1/audio/speech", json=payload)
        if res.status_code != 200:
            raise RuntimeError(f"[FishAudioS2] сервер: HTTP {res.status_code} — {res.text[:200]}")
        if output_path:
            with open(output_path, "wb") as f:
                f.write(res.content)

class SileroProvider(BaseTTSProvider):
    _model = None
    @classmethod
    def _get_model(cls):
        if cls._model is None:
            import torch
            cls._model = torch.hub.load(repo_or_dir='snakers4/silero-models', model='silero_tts', language='ru', speaker='v4_ru')
        return cls._model

    async def generate_tts(self, text: str, voice_model: str, **kwargs):
        import torch
        model = self._get_model()
        sample_rate = 48000
        speaker = 'kseniya' if voice_model in ('', 'aria') else voice_model
        audio = model.apply_tts(text=clean_voice_tags(text), speaker=speaker, sample_rate=sample_rate)
        if audio.dim() == 1:
            audio = audio.unsqueeze(0)
        output_path = kwargs.get("output_path", "")
        if output_path:
            import torchaudio
            torchaudio.save(output_path, audio, sample_rate)

class ElevenLabsProvider(BaseTTSProvider):
    async def generate_tts(self, text: str, voice_model: str, **kwargs):
        api_keys = kwargs.get("api_keys") or {}
        api_key = api_keys.get('elevenlabs', os.environ.get('ELEVENLABS_API_KEY', ''))
        voice_id = voice_model or '21m00Tcm4TlvDq8ikWAM'
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        async with httpx.AsyncClient() as client:
            res = await client.post(url, headers={"xi-api-key": api_key}, json={"text": clean_voice_tags(text), "model_id": "eleven_monolingual_v1", "voice_settings": {"stability": 0.5, "similarity_boost": 0.5}}, timeout=60.0)
            if res.status_code != 200:
                raise RuntimeError(f"ElevenLabs API error: {res.status_code}")
            output_path = kwargs.get("output_path", "")
            if output_path:
                with open(output_path, 'wb') as f:
                    f.write(res.content)

class OpenAIProvider(BaseTTSProvider):
    async def generate_tts(self, text: str, voice_model: str, **kwargs):
        api_keys = kwargs.get("api_keys") or {}
        api_key = api_keys.get('openai', os.environ.get('OPENAI_API_KEY', ''))
        voice = voice_model or 'nova'
        async with httpx.AsyncClient() as client:
            res = await client.post("https://api.openai.com/v1/audio/speech", headers={"Authorization": f"Bearer {api_key}"}, json={"model": "tts-1", "input": clean_voice_tags(text), "voice": voice, "response_format": "wav"}, timeout=60.0)
            if res.status_code != 200:
                raise RuntimeError(f"OpenAI TTS API error: {res.status_code}")
            output_path = kwargs.get("output_path", "")
            if output_path:
                with open(output_path, 'wb') as f:
                    f.write(res.content)

def _gateway_prep(text: str, voice: str, is_minimax: bool, kwargs: dict):
    """Готовит (text, voice, extra_body) для OpenAI-совместимого шлюза.
    Локальные спикеры маплятся на голос провайдера; для minimax выкусывается [emotion: x]
    и уезжает в voice_setting, который шлюз прокидывает в MiniMax нативно."""
    raw_voice = voice
    text, inline_instruct = extract_instruct_tag(text)
    text = clean_voice_tags(text)
    if voice in _LOCAL_SPEAKERS:
        voice = MINIMAX_DEFAULT_VOICE if is_minimax else "nova"
    extra = {}
    if is_minimax:
        text, emotion = split_emotion_tag(text)
        # ponytail: форсируем русскую фонетику — без boost модель коверкает русские слова английским голосом
        extra["language_boost"] = "Russian"
        extra["voice_setting"] = {
            "speed": float(kwargs.get("speed", 1.0)),
            "pitch": int(kwargs.get("pitch", 0)),
        }
        if emotion:
            extra["voice_setting"]["emotion"] = emotion
        if inline_instruct:
            extra["voice_setting"]["design_prompt"] = inline_instruct
    # Дизайн голоса по промпту (MiniMax voice_design) и клонирование по референсу — уходят в voice_setting
    if raw_voice == 'design' and kwargs.get('design_prompt'):
        extra.setdefault("voice_setting", {})["design_prompt"] = kwargs.get('design_prompt')
    if raw_voice == 'clone' and kwargs.get('ref_audio_path'):
        extra.setdefault("voice_setting", {})["ref_audio_path"] = kwargs.get('ref_audio_path')
        if kwargs.get('ref_text'):
            extra["voice_setting"]["ref_text"] = kwargs.get('ref_text')
    return text, voice, extra

class GatewayTTSProvider(BaseTTSProvider):
    """TTS через OpenAI-совместимый маршрут: RouterAI — основной, AITUNNEL — резерв.
    Модель задаётся в UI как 'provider/model' (например minimax/speech-2.8-hd).
    Для minimax/* нативные параметры (emotion, speed, pitch) уходят в extra_body.voice_setting."""

    def __init__(self, model: str):
        self.model = model

    async def generate_tts(self, text: str, voice_model: str, **kwargs):
        api_keys = kwargs.get("api_keys") or {}
        if voice_model == 'clone' and not kwargs.get('ref_audio_path'):
            raise RuntimeError("Для клонирования голоса нужен аудио-референс (ref_audio_path)")
        if voice_model == 'design' and not kwargs.get('design_prompt'):
            raise RuntimeError("Для дизайна голоса нужен промпт (design_prompt)")
        is_minimax = self.model.lower().startswith("minimax/")
        text, voice, extra_body = _gateway_prep(text, voice_model or 'nova', is_minimax, kwargs)
        if not text:
            raise RuntimeError(
                "Текст для озвучки пуст (возможно, он содержит только визуальную ремарку). "
                "Перейдите во вкладку '📝 Raw Script' и сделайте пробел для перепарсинга."
            )

        from openai import AsyncOpenAI
        routes = [
            (api_keys.get('routerai') or os.environ.get('ROUTERAI_API_KEY', ''), 'https://routerai.ru/api/v1', 'RouterAI'),
            (api_keys.get('aitunnel') or os.environ.get('AITUNNEL_API_KEY', ''), 'https://api.aitunnel.ru/v1/', 'AITUNNEL'),
        ]
        last_error = None
        for api_key, base, name in routes:
            if not api_key:
                continue
            try:
                client = AsyncOpenAI(api_key=api_key, base_url=base)
                # AITUNNEL использует нативные id без префикса провайдера: minimax/speech-2.8-hd -> speech-2.8-hd
                model = self.model.split("/", 1)[-1] if name == 'AITUNNEL' else self.model
                # ponytail: MiniMax принимает только mp3|pcm (wav отклоняется ZodError'ом на шлюзе)
                response_format = "mp3" if is_minimax else "wav"
                response = await client.audio.speech.create(
                    model=model,
                    voice=voice,
                    input=text,
                    response_format=response_format,
                    extra_body=extra_body or None,
                )
                output_path = kwargs.get("output_path", "")
                if output_path:
                    with open(output_path, 'wb') as f:
                        f.write(response.content)
                return
            except Exception as exc:
                print(f"[WARN] {name} TTS error: {exc}. Переключение на следующий шлюз...")
                last_error = exc
        raise RuntimeError(f"Gateway TTS недоступен: {last_error or 'ключи не заданы'}")

class TTSProviderFactory:
    _active_provider_class = None

    @classmethod
    def get_provider(cls, engine: Optional[str]) -> BaseTTSProvider:
        if engine in ("silero", "snakers4/silero-models"):
            provider_cls = SileroProvider
        elif engine == "elevenlabs":
            provider_cls = ElevenLabsProvider
        elif engine == "openai":
            provider_cls = OpenAIProvider
        elif engine == "k2-fsa/OmniVoice":
            provider_cls = OmniVoiceProvider
        elif engine in _LOCAL_TTS_ENGINES:
            cfg = _LOCAL_TTS_ENGINES[engine]
            return LocalLLMTTSProvider(cfg["engine"], cfg["python"], cfg["model"], cfg["mode"], cfg.get("codec"))
        elif engine and "cosyvoice" in engine.lower():
            provider_cls = CosyVoiceProvider
        elif engine and ("s2" in engine.lower() or "fish" in engine.lower()):
            provider_cls = FishAudioS2Provider
        elif engine and "/" in engine:
            provider_cls = GatewayTTSProvider
        else:
            provider_cls = OmniVoiceProvider

        # ponytail: единая точка выгрузки — при смене движка старая модель уходит из VRAM сама
        if cls._active_provider_class and cls._active_provider_class != provider_cls:
            if hasattr(cls._active_provider_class, 'unload_model'):
                print(f"[VRAM] Авто-выгрузка {cls._active_provider_class.__name__} из памяти...")
                cls._active_provider_class.unload_model()
        cls._active_provider_class = provider_cls

        if provider_cls == GatewayTTSProvider:
            return GatewayTTSProvider(engine)
        return provider_cls()

    @classmethod
    def unload_all(cls):
        """Принудительная выгрузка ЛЮБОЙ активной TTS-модели из VRAM (абстрактно)."""
        print("[VRAM] Абстрактная очистка памяти TTS...")
        if cls._active_provider_class and hasattr(cls._active_provider_class, 'unload_model'):
            cls._active_provider_class.unload_model()
            cls._active_provider_class = None
        try:
            from app.services.lavasr_enhancer import LavaSREnhancer
            LavaSREnhancer.unload_model()
        except Exception:
            pass

try:
    import torch
    if torch.cuda.is_available():
        OmniVoiceProvider._get_model()
except Exception:
    pass

if __name__ == "__main__":
    import asyncio

    # pure-logic checks (без сети): маршрутизация движков, замена локальных спикеров, парсинг тегов озвучки
    async def _check():
        factory = TTSProviderFactory
        assert isinstance(factory.get_provider("k2-fsa/OmniVoice"), OmniVoiceProvider)
        assert isinstance(factory.get_provider("FunAudioLLM/Fun-CosyVoice3-0.5B"), CosyVoiceProvider)
        assert isinstance(factory.get_provider("snakers4/silero-models"), SileroProvider)
        assert isinstance(factory.get_provider("fishaudio/s2-pro"), FishAudioS2Provider)
        assert isinstance(factory.get_provider("openai/tts-1-hd"), GatewayTTSProvider)
        assert isinstance(factory.get_provider("minimax/speech-2.8-hd"), GatewayTTSProvider)
        mm = factory.get_provider("minimax/speech-2.8-hd")
        assert mm.model == "minimax/speech-2.8-hd"
        assert factory.get_provider("openai") is not None
        # Локальные LLM-TTS маршрутизация (без сети): движок -> правильная модель, режим и venv
        qd = factory.get_provider("qwen-tts/voice-design")
        assert isinstance(qd, LocalLLMTTSProvider) and qd.mode == "design" and qd.engine == "qwen"
        assert qd.model == "ai-models/Qwen3-TTS-VoiceDesign"
        qc = factory.get_provider("qwen-tts/clone")
        assert isinstance(qc, LocalLLMTTSProvider) and qc.mode == "clone"
        assert qc.model == "ai-models/Qwen3-TTS-Base"
        assert isinstance(factory.get_provider("qwen-tts/custom-voice"), LocalLLMTTSProvider)
        mm = factory.get_provider("moss-tts/local")
        assert isinstance(mm, LocalLLMTTSProvider) and mm.engine == "moss" and mm.codec == "ai-models/MOSS-Audio-Tokenizer"
        # voice-clone: пользовательский референс прокидывается как есть; базовый голос без WAV -> понятная ошибка
        ra, rt = resolve_clone_reference("aria", "/x/ref.wav", "привет")
        assert (ra, rt) == ("/x/ref.wav", "привет")
        try:
            resolve_clone_reference("aria", None, None)
            raise AssertionError("базовый голос без WAV должен упасть")
        except ValueError as e:
            assert "speakers" in str(e)
        # emotion-тег вырезается и валидируется; whisper на 2.8 не поддержан -> auto
        t, e = split_emotion_tag("  [emotion: angry] Какого черта это упало? ")
        assert (t, e) == ("Какого черта это упало?", "angry")
        t, e = split_emotion_tag("Стало страшно? <#1.5#> (sighs) [emotion: whisper] скорее нет")
        assert e is None and "[emotion" not in t
        assert clean_voice_tags("[emotion: calm] Я жду <#1.5#> (sighs) ответа.").lower().split() == ["я", "жду", "ответа."]
        # instruct-тег: инструкция вынимается, текст очищается
        t, ins = extract_instruct_tag("[instruct: Speak slowly and softly] Сегодня поговорим.")
        assert ins == "Speak slowly and softly" and "[instruct" not in t
        # S2: инлайн-теги [tag], <#пауза#> -> [pause], скобки вырезаются, design_prompt ведущим тегом
        assert to_s2_text("Привет <#1.5#> (sighs) [emotion: calm] друг") == "Привет [pause] [calm] друг"
        assert to_s2_text("Привет.", "говори тихо") == "[говори тихо] Привет."
        assert to_s2_text("*ремарка* Привет.") == "Привет."
        t, v, extra = _gateway_prep("[instruct: грубый голос] Привет.", "aria", True, {})
        assert v == MINIMAX_DEFAULT_VOICE and extra["voice_setting"]["design_prompt"] == "грубый голос" and "[instruct" not in t
        # шлюз: minimax получает очищенный текст + voice_setting.emotion в extra_body
        t, v, extra = _gateway_prep("[emotion: sad] База исчезла.", "aria", True, {})
        assert v == MINIMAX_DEFAULT_VOICE and extra["voice_setting"]["emotion"] == "sad" and "[emotion" not in t
        assert extra["language_boost"] == "Russian"  # русская фонетика принудительно
        t, v, extra = _gateway_prep("[emotion: sad] Ок.", "marcus", False, {})
        assert v == "nova" and extra == {}
        # клонирование/дизайн в шлюзе: данные уходят в voice_setting, без данных — понятная ошибка
        gw = GatewayTTSProvider("minimax/speech-2.8-hd")
        assert gw.model.split("/", 1)[-1] == "speech-2.8-hd"  # AITUNNEL без префикса провайдера
        t, v, extra = _gateway_prep("текст", "clone", True, {"ref_audio_path": "/x/ref.wav", "ref_text": "привет"})
        assert v == MINIMAX_DEFAULT_VOICE and extra["voice_setting"]["ref_audio_path"] == "/x/ref.wav" and extra["voice_setting"]["ref_text"] == "привет"
        t, v, extra = _gateway_prep("текст", "design", True, {"design_prompt": "глубокий голос"})
        assert v == "design" and extra["voice_setting"]["design_prompt"] == "глубокий голос"
        try:
            await gw.generate_tts("тест", "clone", api_keys={"routerai": "x"})
            raise AssertionError("clone без референса должен упасть")
        except RuntimeError as e:
            assert "аудио-референс" in str(e)
        try:
            await gw.generate_tts("тест", "design", api_keys={"routerai": "x"})
            raise AssertionError("design без промпта должен упасть")
        except RuntimeError as e:
            assert "дизайна голоса" in str(e)
        print("audio_provider gateway mapping OK")

    asyncio.run(_check())
