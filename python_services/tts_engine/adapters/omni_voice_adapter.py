"""Адаптер локального движка OmniVoice (k2-fsa).

Поддерживаются два способа запуска:

1. **GGUF (основной, CrispASR)** — квантованные веса `cstr/omnivoice-GGUF`,
   инференс через пакет `crispasr` (ggml/CUDA, без PyTorch):
       omnivoice-q8_0.gguf          — Qwen3-0.6B бэкбон + audio embeddings/heads;
       omnivoice-tokenizer-f16.gguf — HiggsAudioV2 audio-codec (HuBERT + DAC).

   Файлы ищутся в `OMNIVOICE_GGUF_DIR`, `OMNIVOICE_GGUF_MODEL` +
   `OMNIVOICE_GGUF_CODEC`, либо в стандартной папке
   `<TTS_MODELS_DIR>/OmniVoice-GGUF`. Клонирование голоса — из reference-WAV
   (`.pt`-вектор не требуется), Voice Design — через `set_instruct`.

2. **PyTorch (legacy)** — официальный чекпоинт `k2-fsa/OmniVoice` через пакет
   `omnivoice` (fp16/fp32/int8). Используется, если GGUF-файлы не найдены.

Публичный контракт (`engine_id`, `capabilities`, методы) не меняется.
"""

import ctypes
import gc
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
import soundfile as sf

from .base_engine import BaseVoiceEngine

logger = logging.getLogger("tts_engine.omni_voice")

# Официальный чекпоинт и int8-квантованный вариант (bitsandbytes) на Hugging Face.
HF_REPO = "k2-fsa/OmniVoice"
HF_INT8_REPO = "kawshikbuet17/OmniVoice-int8-bnb"

# GGUF-репозиторий CrispASR и ожидаемые имена файлов (в порядке предпочтения).
GGUF_REPO = "cstr/omnivoice-GGUF"
_GGUF_MAIN_NAMES = (
    "omnivoice-q8_0.gguf",
    "omnivoice-f16.gguf",
    "omnivoice-q6_k.gguf",
    "omnivoice-q5_k.gguf",
    "omnivoice-q4_k.gguf",
)
_GGUF_CODEC_NAMES = (
    "omnivoice-tokenizer-f16.gguf",
    "omnivoice-tokenizer-q8_0.gguf",
)

# Дефолтные "профили" голосов для voice-design без клонирования (instruct mode).
_VOICE_PRESETS = {
    "aria": "female, young adult, moderate pitch",
    "marcus": "male, middle-aged, low pitch",
    "nova": "female, young adult, high pitch",
}

VALID_INSTRUCTS = {
    "american accent", "australian accent", "british accent", "canadian accent", "child", 
    "chinese accent", "elderly", "female", "high pitch", "indian accent", "japanese accent", 
    "korean accent", "low pitch", "male", "middle-aged", "moderate pitch", "portuguese accent", 
    "russian accent", "teenager", "very high pitch", "very low pitch", "whisper", "young adult",
    "东北话", "中年", "中音调", "云南话", "低音调", "儿童", "四川话", "女", "宁夏话", "少年", 
    "极低音调", "极高音调", "桂林话", "河南话", "济南话", "甘肃话", "男", "石家庄话", "老年", 
    "耳语", "贵州话", "陕西话", "青岛话", "青年", "高音调"
}


def _default_models_dir() -> Path:
    """Каталог с локальными весами.

    Приоритет: переменные окружения TTS_MODELS_DIR / AI_MODELS_DIR, затем
    стандартная папка монорепозитория python_services/tts_engine/ai-models.
    """
    for key in ("TTS_MODELS_DIR", "AI_MODELS_DIR"):
        value = os.getenv(key)
        if value:
            return Path(value)
    return Path(__file__).resolve().parents[1] / "ai-models"


def _config_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "") or default)
    except ValueError:
        return default


def _config_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, "") or default)
    except ValueError:
        return default


def _find_first(directory: Path, names: Tuple[str, ...]) -> Optional[Path]:
    for name in names:
        candidate = directory / name
        if candidate.is_file():
            return candidate
    return None


def _candidate_gguf_dirs():
    """Каталоги для поиска GGUF (по приоритету).

    Модели лежат внутри проекта: `<TTS_MODELS_DIR>/OmniVoice-GGUF`.
    Путь `OMNIVOICE_GGUF_DIR` переопределяет расположение.
    """
    dirs = []
    env_dir = os.getenv("OMNIVOICE_GGUF_DIR")
    if env_dir:
        dirs.append(Path(env_dir))
    dirs.append(_default_models_dir() / "OmniVoice-GGUF")
    return dirs


def _ascii_native_path(path: str) -> str:
    """Возвращает ASCII-путь для нативных библиотек (libcrispasr, ggml).

    libcrispasr/open() использует нативный fopen, который на Windows работает
    в ANSI-кодировке и не понимает кириллицу. Если проект лежит в пути вида
    `...\\Проекты\\...`, конвертируем путь в 8.3 short-форму (ASCII), которая
    указывает на тот же файл внутри проекта.
    """
    value = str(path)
    if os.name != "nt":
        return value
    try:
        value.encode("ascii")
        return value
    except UnicodeEncodeError:
        pass

    try:
        get_short = ctypes.windll.kernel32.GetShortPathNameW  # type: ignore[attr-defined]
        get_short.argtypes = [ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint]
        get_short.restype = ctypes.c_uint
        buf = ctypes.create_unicode_buffer(1024)
        written = get_short(value, buf, len(buf))
        if written and written < len(buf):
            short = buf.value
            short.encode("ascii")  # страховка: short-путь обязан быть ASCII
            return short
    except (OSError, UnicodeError, ValueError):
        pass
    return value


def _resolve_gguf() -> Tuple[Optional[Path], Optional[Path]]:
    """Находит main- и codec-GGUF OmniVoice. Возвращает (main, codec) или (None, None)."""
    explicit_main = os.getenv("OMNIVOICE_GGUF_MODEL")
    if explicit_main:
        main = Path(explicit_main)
        if not main.is_file():
            logger.warning("[OmniVoice] OMNIVOICE_GGUF_MODEL не найден: %s", main)
            return None, None
        codec_env = os.getenv("OMNIVOICE_GGUF_CODEC")
        codec = Path(codec_env) if codec_env and Path(codec_env).is_file() else _find_first(main.parent, _GGUF_CODEC_NAMES)
        return main, codec

    for directory in _candidate_gguf_dirs():
        if not directory.is_dir():
            continue
        main = _find_first(directory, _GGUF_MAIN_NAMES)
        if main is not None:
            return main, _find_first(directory, _GGUF_CODEC_NAMES)

    return None, None


class OmniVoiceAdapter(BaseVoiceEngine):
    engine_id = "omni_voice_v1"
    name = "OmniVoice (k2-fsa, GGUF/compressed)"
    capabilities = ["synthesis", "clone", "design"]

    def __init__(self, checkpoint: Optional[str] = None) -> None:
        # Точка загрузки для legacy PyTorch-режима: локальный каталог либо HF-репозиторий.
        self._checkpoint = checkpoint or os.getenv("OMNIVOICE_CHECKPOINT") or None
        # Режим точности: auto | fp16 | int8 | fp32 (только для PyTorch-режима).
        self.quantize = (os.getenv("OMNIVOICE_QUANTIZE", "auto") or "auto").strip().lower()

        self._gguf_main, self._gguf_codec = _resolve_gguf()
        self.backend_kind: str = "gguf" if self._gguf_main is not None else "pt"

        self.model: Any = None          # legacy omnivoice. OmniVoice
        self._session: Any = None       # crispasr.Session (GGUF)
        self._session_mode: Optional[str] = None

        self.sampling_rate: int = 24000
        self.device: str = self._detect_device()

    # ------------------------------------------------------------------ #
    #  Внутренние помощники
    # ------------------------------------------------------------------ #
    @staticmethod
    def _detect_device() -> str:
        try:
            import torch

            return "cuda" if torch.cuda.is_available() else "cpu"
        except Exception:  # noqa: BLE001 — torch не нужен в GGUF-режиме
            return "cuda"

    @property
    def _device_map(self) -> str:
        return "cuda:0" if self.device == "cuda" else "cpu"

    def _resolve_checkpoint(self) -> str:
        if self._checkpoint:
            return self._checkpoint
        models_dir = _default_models_dir()
        local = models_dir / "OmniVoice"
        if local.exists():
            logger.info("[%s] Найден локальный чекпоинт: %s", self.name, local)
            return str(local)
        if (models_dir / "config.json").exists():
            logger.info("[%s] Найден локальный чекпоинт: %s", self.name, models_dir)
            return str(models_dir)
        if self.quantize == "int8":
            return HF_INT8_REPO
        return HF_REPO

    def _pick_dtype(self):
        import torch

        quant = self.quantize
        if quant == "int8":
            return torch.float16
        if quant == "fp16":
            if self.device != "cuda":
                logger.warning("[%s] fp16 запрошен, но CUDA недоступна — fallback на fp32.", self.name)
                return torch.float32
            return torch.float16
        return torch.float16 if self.device == "cuda" else torch.float32

    @staticmethod
    def _waveform_to_numpy(audio) -> np.ndarray:
        if hasattr(audio, "detach"):
            audio = audio.detach()
        if hasattr(audio, "cpu"):
            audio = audio.cpu()
        if hasattr(audio, "squeeze"):
            audio = audio.squeeze()
        if hasattr(audio, "numpy"):
            audio = audio.numpy()
        return np.asarray(audio, dtype=np.float32)

    # ------------------------------------------------------------------ #
    #  Жизненный цикл в VRAM
    # ------------------------------------------------------------------ #
    def load(self):
        if self.model is not None or self._session is not None:
            return
        if self.backend_kind == "gguf":
            self._load_gguf()
        else:
            self._load_pt()

    def _load_gguf(self):
        try:
            import crispasr
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                f"[{self.name}] Пакет 'crispasr' не установлен. Windows CUDA: "
                "pip install crispasr --extra-index-url https://crispstrobe.github.io/CrispASR/whl/cuda/"
            ) from exc

        logger.info(
            "[%s] Загрузка GGUF: main=%s codec=%s",
            self.name, self._gguf_main, self._gguf_codec,
        )
        session = crispasr.Session(
            _ascii_native_path(self._gguf_main), n_threads=_config_int("OMNIVOICE_THREADS", 4)
        )
        if self._gguf_codec is not None:
            session.set_codec_path(_ascii_native_path(self._gguf_codec))

        self._session = session
        self._session_mode = None
        try:
            rate = int(session.output_sample_rate())
        except Exception:  # noqa: BLE001
            rate = 24000
        self.sampling_rate = rate or 24000
        logger.info(
            "[%s] GGUF загружен: backend=%s sample_rate=%s",
            self.name, getattr(session, "backend", "?"), self.sampling_rate,
        )

    def _load_pt(self):
        try:
            from omnivoice import OmniVoice
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                f"[{self.name}] Пакет 'omnivoice' не установлен. "
                "Выполните: pip install omnivoice (или задайте GGUF через OMNIVOICE_GGUF_DIR)."
            ) from exc

        import torch

        checkpoint = self._resolve_checkpoint()
        dtype = self._pick_dtype()
        logger.info(
            "[%s] Загрузка весов: checkpoint=%s device_map=%s dtype=%s quantize=%s",
            self.name, checkpoint, self._device_map, dtype, self.quantize,
        )

        kwargs: Dict[str, Any] = {"device_map": self._device_map, "dtype": dtype}

        if self.quantize == "int8":
            try:
                self.model = OmniVoice.from_pretrained(checkpoint, **kwargs)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "[%s] Предквантованный чекпоинт '%s' не загрузился (%s). "
                    "Пробую load_in_8bit поверх официального чекпоинта.",
                    self.name, checkpoint, exc,
                )
                if checkpoint == HF_INT8_REPO:
                    checkpoint = HF_REPO
                kwargs["load_in_8bit"] = True
                self.model = OmniVoice.from_pretrained(checkpoint, **kwargs)
        else:
            self.model = OmniVoice.from_pretrained(checkpoint, **kwargs)

        self.sampling_rate = int(getattr(self.model, "sampling_rate", 24000) or 24000)
        logger.info("[%s] Веса загружены, sampling_rate=%s.", self.name, self.sampling_rate)

    def unload(self):
        if self._session is not None:
            logger.info("[%s] Выгрузка GGUF-сессии...", self.name)
            try:
                self._session.close()
            except Exception as exc:  # noqa: BLE001
                logger.warning("[%s] Ошибка закрытия crispasr.Session: %s", self.name, exc)
            self._session = None
            self._session_mode = None

        if self.model is not None:
            logger.info("[%s] Выгрузка весов из VRAM...", self.name)
            del self.model
            self.model = None

        gc.collect()
        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:  # noqa: BLE001
            pass

    # ------------------------------------------------------------------ #
    #  GGUF: управление режимом голоса (Session хранит состояние)
    # ------------------------------------------------------------------ #
    def _open_gguf_session(self):
        if self._session is not None:
            try:
                self._session.close()
            except Exception:  # noqa: BLE001
                pass
            self._session = None
        self._gguf_main, self._gguf_codec = _resolve_gguf() or (self._gguf_main, self._gguf_codec)
        self._load_gguf()

    def _ensure_mode(self, mode: str):
        """Session не умеет сбрасывать voice/instruct, поэтому при смене режима
        переоткрываем сессию (модели читаются из mmap — это дешево)."""
        if self._session is None or self._session_mode != mode:
            self._open_gguf_session()
            self._session_mode = mode
        return self._session

    def _require_session(self):
        if self._session is None:
            raise RuntimeError(
                f"[{self.name}] Модель не загружена. Вызовите load() "
                "(VramManager делает это автоматически при первом запросе)."
            )
        return self._session

    @staticmethod
    def _filter_instruct(instruct: str) -> str:
        parts = [p.strip().lower() for p in instruct.replace("，", ",").split(",")]
        valid = [p for p in parts if p in VALID_INSTRUCTS]
        return ", ".join(valid)

    @staticmethod
    def _read_clone_sidecar(embedding_path: str, ref_text: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """`.pt`-путь в GGUF-режиме содержит JSON-сайдкар с путём к reference-WAV."""
        try:
            raw = Path(embedding_path).read_text(encoding="utf-8")
            meta = json.loads(raw)
            return meta.get("reference_audio_path"), meta.get("reference_text") or ref_text
        except Exception:  # noqa: BLE001 — не наш сайдкар / .pt от PyTorch
            return None, ref_text

    # ------------------------------------------------------------------ #
    #  Клонирование голоса
    # ------------------------------------------------------------------ #
    def clone_voice(
        self,
        ref_audio_path: str,
        output_embedding_path: str,
        ref_text: Optional[str] = None,
    ):
        if not ref_audio_path or not os.path.exists(ref_audio_path):
            raise ValueError(f"Эталонное аудио не найдено: {ref_audio_path}")

        output = Path(output_embedding_path)
        output.parent.mkdir(parents=True, exist_ok=True)

        if self.backend_kind == "gguf":
            # Клон строится напрямую из reference-WAV при синтезе, поэтому здесь
            # достаточно сохранить сайдкар (тот же путь, что C# хранит в профиле).
            meta = {
                "format": "crispasr-omnivoice-clone/v1",
                "reference_audio_path": os.path.abspath(ref_audio_path),
                "reference_text": ref_text,
            }
            output.write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
            logger.info("[%s] GGUF clone marker сохранён: %s", self.name, output)
            return

        model = self.model
        if model is None:
            raise RuntimeError(
                f"[{self.name}] Модель не загружена. Вызовите load() "
                "(VramManager делает это автоматически при первом запросе)."
            )
        logger.info("[%s] Клонирование голоса из %s (ref_text=%s)...", self.name, ref_audio_path, ref_text)
        prompt = model.create_voice_clone_prompt(ref_audio=ref_audio_path, ref_text=ref_text or None)
        prompt.save(str(output))
        logger.info("[%s] Voice clone prompt сохранён: %s", self.name, output)

    # ------------------------------------------------------------------ #
    #  Синтез речи
    # ------------------------------------------------------------------ #
    def synthesize(
        self,
        text: str,
        embedding_path: Optional[str],
        instruct: Optional[str],
        output_path: str,
        speed: float = 1.0,
        pitch: float = 1.0,
        gen_config: Optional[dict] = None,
        reference_audio_path: Optional[str] = None,
        reference_text: Optional[str] = None,
    ):
        text = (text or "").strip()
        if not text:
            raise ValueError("Текст для озвучки пуст.")

        if self.backend_kind == "gguf":
            self._synthesize_gguf(
                text, embedding_path, instruct, output_path,
                speed, pitch, gen_config, reference_audio_path, reference_text,
            )
        else:
            self._synthesize_pt(
                text, embedding_path, instruct, output_path,
                speed, pitch, gen_config, reference_audio_path, reference_text,
            )

    def _synthesize_gguf(
        self,
        text: str,
        embedding_path: Optional[str],
        instruct: Optional[str],
        output_path: str,
        speed: float,
        pitch: float,
        gen_config: Optional[dict],
        reference_audio_path: Optional[str],
        reference_text: Optional[str],
    ):
        session = self._require_session()
        gen = gen_config or {}

        instruct = (instruct or "").strip() or None
        ref_audio = reference_audio_path
        ref_text = reference_text
        if not ref_audio and embedding_path:
            ref_audio, ref_text = self._read_clone_sidecar(embedding_path, ref_text)

        # Взаимоисключающие источники голоса: Design (instruct) > Clone (ref-wav) > preset.
        if instruct:
            filtered = self._filter_instruct(instruct)
            if not filtered:
                voice = os.getenv("OMNIVOICE_VOICE", "nova")
                filtered = _VOICE_PRESETS.get(voice, voice)
                logger.warning(
                    "[%s] Все теги дизайна невалидны: '%s'. Fallback '%s'.",
                    self.name, instruct, filtered,
                )
            session = self._ensure_mode("instruct")
            session.set_instruct(filtered)
            logger.info("[%s] Режим Voice Design (GGUF): '%s'", self.name, filtered)
        elif ref_audio and os.path.exists(ref_audio):
            session = self._ensure_mode("clone")
            session.set_voice(_ascii_native_path(ref_audio), ref_text or None)
            logger.info("[%s] Режим Zero-Shot Clone (GGUF): %s", self.name, ref_audio)
        else:
            voice = os.getenv("OMNIVOICE_VOICE", "nova")
            session = self._ensure_mode("default")
            session.set_instruct(_VOICE_PRESETS.get(voice, voice))
            logger.info("[%s] Авто-голос через preset '%s' (GGUF)", self.name, voice)

        # Язык вывода, если задан (ISO 639-3, напр. 'rus'/'de').
        language = os.getenv("OMNIVOICE_LANGUAGE")
        if language:
            try:
                session.set_target_language(language)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[%s] set_target_language(%s) не поддержан: %s", self.name, language, exc)

        # Шаги диффузии.
        steps = int(gen.get("num_steps", _config_int("OMNIVOICE_STEPS", 32)) or 32)
        if steps > 0:
            try:
                session.set_tts_steps(steps)
            except Exception as exc:  # noqa: BLE001
                logger.debug("[%s] set_tts_steps(%s) не поддержан: %s", self.name, steps, exc)

        if float(speed or 1.0) != 1.0:
            logger.warning("[%s] speed=%s в GGUF-режиме игнорируется.", self.name, speed)
        if float(pitch or 1.0) != 1.0:
            logger.warning("[%s] pitch=%s движком не поддерживается — игнорируется.", self.name, pitch)

        use_raw = (os.getenv("OMNIVOICE_CRISPASR_RAW", "0") or "0").strip() in ("1", "true", "yes")
        if use_raw:
            session.accept_marking_responsibility("Vidora local TTS worker")
            pcm = session.synthesize_raw(text)
        else:
            pcm = session.synthesize(text)

        waveform = np.asarray(pcm, dtype=np.float32).reshape(-1)
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output), waveform, self.sampling_rate, subtype="PCM_16")
        logger.info("[%s] WAV записан (GGUF): %s (sr=%s, samples=%s)",
                    self.name, output, self.sampling_rate, waveform.size)

    def _synthesize_pt(
        self,
        text: str,
        embedding_path: Optional[str],
        instruct: Optional[str],
        output_path: str,
        speed: float,
        pitch: float,
        gen_config: Optional[dict],
        reference_audio_path: Optional[str],
        reference_text: Optional[str],
    ):
        if self.model is None:
            raise RuntimeError(
                f"[{self.name}] Модель не загружена. Вызовите load() "
                "(VramManager делает это автоматически при первом запросе)."
            )
        model = self.model
        from omnivoice import OmniVoiceGenerationConfig, VoiceClonePrompt

        gen = gen_config or {}
        duration = float(gen.get("duration") or 0.0)

        gen_config_obj = OmniVoiceGenerationConfig(
            num_step=int(gen.get("num_steps", _config_int("OMNIVOICE_STEPS", 32))),
            guidance_scale=float(gen.get("guidance_scale", _config_float("OMNIVOICE_GUIDANCE", 3.0))),
            denoise=bool(gen.get("denoise", True)),
            preprocess_prompt=bool(gen.get("preprocess_prompt", True)),
            postprocess_output=bool(gen.get("postprocess_output", True)),
        )

        gen_kwargs: Dict[str, Any] = {"text": text, "generation_config": gen_config_obj}

        instruct = (instruct or "").strip() or None
        if instruct:
            parts = [p.strip().lower() for p in instruct.replace('，', ',').split(',')]
            valid_parts = [p for p in parts if p in VALID_INSTRUCTS]
            if not valid_parts:
                logger.warning("[%s] Все теги дизайна голоса невалидны: '%s'. Использую fallback 'nova'.", self.name, instruct)
                voice = os.getenv("OMNIVOICE_VOICE", "nova")
                gen_kwargs["instruct"] = _VOICE_PRESETS.get(voice, voice)
            else:
                filtered_instruct = ", ".join(valid_parts)
                gen_kwargs["instruct"] = filtered_instruct
                logger.info("[%s] Режим Voice Design. Промпт (filtered): '%s' (orig: '%s')", self.name, filtered_instruct, instruct)
        elif embedding_path:
            prompt = VoiceClonePrompt.load(embedding_path)
            gen_kwargs["voice_clone_prompt"] = prompt
            logger.info("[%s] Режим Zero-Shot Clone, embedding=%s", self.name, embedding_path)
        else:
            voice = os.getenv("OMNIVOICE_VOICE", "nova")
            gen_kwargs["instruct"] = _VOICE_PRESETS.get(voice, voice)
            logger.info("[%s] Авто-голос через preset '%s'", self.name, voice)

        speed = float(speed or 1.0)
        gen_kwargs["speed"] = speed
        if duration > 0:
            gen_kwargs["duration"] = duration

        pitch = float(pitch or 1.0)
        if pitch != 1.0:
            logger.warning("[%s] Параметр pitch=%s движком не поддерживается — игнорируется.", self.name, pitch)

        audio_list = model.generate(**gen_kwargs)
        waveform = self._waveform_to_numpy(audio_list[0])

        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output), waveform, self.sampling_rate, subtype="PCM_16")
        logger.info("[%s] WAV записан: %s (sr=%s)", self.name, output, self.sampling_rate)
