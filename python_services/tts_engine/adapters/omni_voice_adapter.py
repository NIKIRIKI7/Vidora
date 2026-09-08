"""Адаптер локального движка OmniVoice (k2-fsa, сжатый/квантованный).

OmniVoice — massively multilingual zero-shot TTS от k2-fsa (600+ языков).
В этом воркере веса поднимаются в сжатой/квантованной форме, чтобы занимать
меньше VRAM:

  * auto / fp16 — стандартный сжатый режим на CUDA (dtype=torch.float16);
  * int8        — предквантованный чекпоинт (bitsandbytes int8) либо
                   load_in_8bit поверх официального чекпоинта;
  * fp32        — fallback на CPU.

Реальный API модели совпадает с официальным пакетом `omnivoice` (>=0.2.1):

    from omnivoice import OmniVoice, VoiceClonePrompt

    model = OmniVoice.from_pretrained(repo, device_map="cuda:0", dtype=torch.float16)
    audio = model.generate(text=..., voice_clone_prompt=prompt)   # клон
    audio = model.generate(text=..., instruct="female, low pitch")  # дизайн голоса

Клонирование голоса строится на voice clone prompt'ах, которые умеют
сериализоваться на диск в один .pt файл — это и есть наш "вектор голоса":

    prompt = model.create_voice_clone_prompt(ref_audio=..., ref_text=...)
    prompt.save(output_embedding_path)          # .pt
    prompt = VoiceClonePrompt.load(path)        # при синтезе
"""

import gc
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

import numpy as np
import soundfile as sf
import torch

from .base_engine import BaseVoiceEngine

logger = logging.getLogger("tts_engine.omni_voice")

# Официальный чекпоинт и int8-квантованный вариант (bitsandbytes) на Hugging Face.
HF_REPO = "k2-fsa/OmniVoice"
HF_INT8_REPO = "kawshikbuet17/OmniVoice-int8-bnb"

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


class OmniVoiceAdapter(BaseVoiceEngine):
    engine_id = "omni_voice_v1"
    name = "OmniVoice (k2-fsa, compressed/quantized)"
    capabilities = ["synthesis", "clone", "design"]

    def __init__(self, checkpoint: Optional[str] = None) -> None:
        # Точка загрузки: локальный каталог с весами либо HF-репозиторий.
        self._checkpoint = checkpoint or os.getenv("OMNIVOICE_CHECKPOINT") or None
        # Режим точности: auto | fp16 | int8 | fp32
        self.quantize = (os.getenv("OMNIVOICE_QUANTIZE", "auto") or "auto").strip().lower()

        self.model: Any = None
        self.sampling_rate: int = 24000
        self.device: str = "cuda" if torch.cuda.is_available() else "cpu"
        self._device_map: str = "cuda:0" if self.device == "cuda" else "cpu"

    # ------------------------------------------------------------------ #
    #  Внутренние помощники
    # ------------------------------------------------------------------ #
    def _resolve_checkpoint(self) -> str:
        if self._checkpoint:
            return self._checkpoint
        models_dir = _default_models_dir()
        # Стандартный вариант: <models_dir>/OmniVoice
        local = models_dir / "OmniVoice"
        if local.exists():
            logger.info("[%s] Найден локальный чекпоинт: %s", self.name, local)
            return str(local)
        # Вариант, когда сам models_dir уже является чекпоинтом (config.json в корне).
        if (models_dir / "config.json").exists():
            logger.info("[%s] Найден локальный чекпоинт: %s", self.name, models_dir)
            return str(models_dir)
        # int8-режим по умолчанию берёт предквантованный репозиторий.
        if self.quantize == "int8":
            return HF_INT8_REPO
        return HF_REPO

    def _pick_dtype(self) -> torch.dtype:
        quant = self.quantize
        if quant == "int8":
            return torch.float16  # собственно int8 активируется bnb-квантованием
        if quant == "fp16":
            if self.device != "cuda":
                logger.warning(
                    "[%s] fp16 запрошен, но CUDA недоступна — fallback на fp32.",
                    self.name,
                )
                return torch.float32
            return torch.float16
        # auto: на GPU сжимаем в fp16, на CPU остаёмся в fp32.
        return torch.float16 if self.device == "cuda" else torch.float32

    def _require_model(self):
        if self.model is None:
            raise RuntimeError(
                f"[{self.name}] Модель не загружена. Вызовите load() "
                "(VramManager делает это автоматически при первом запросе)."
            )
        return self.model

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
        if self.model is not None:
            return

        try:
            from omnivoice import OmniVoice
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                f"[{self.name}] Пакет 'omnivoice' не установлен. "
                "Выполните: pip install omnivoice"
            ) from exc

        checkpoint = self._resolve_checkpoint()
        dtype = self._pick_dtype()
        logger.info(
            "[%s] Загрузка весов: checkpoint=%s device_map=%s dtype=%s quantize=%s",
            self.name, checkpoint, self._device_map, dtype, self.quantize,
        )

        kwargs: Dict[str, Any] = {
            "device_map": self._device_map,
            "dtype": dtype,
        }

        if self.quantize == "int8":
            # Пробуем предквантованный чекпоинт; при неудаче откатываемся на
            # официальный чекпоинт с динамическим int8 (load_in_8bit).
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
        if self.model is None:
            return
        logger.info("[%s] Выгрузка весов из VRAM...", self.name)
        del self.model
        self.model = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

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

        model = self._require_model()
        logger.info(
            "[%s] Клонирование голоса из %s (ref_text=%s)...",
            self.name, ref_audio_path, ref_text,
        )

        # Если ref_text не передан — модель сама расшифрует эталон через Whisper ASR.
        prompt = model.create_voice_clone_prompt(
            ref_audio=ref_audio_path,
            ref_text=ref_text or None,
        )

        output = Path(output_embedding_path)
        output.parent.mkdir(parents=True, exist_ok=True)
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
    ):
        text = (text or "").strip()
        if not text:
            raise ValueError("Текст для озвучки пуст.")

        model = self._require_model()

        from omnivoice import OmniVoiceGenerationConfig, VoiceClonePrompt

        gen = gen_config or {}
        duration = float(gen.get("duration") or 0.0)

        # Тонкие настройки диффузии (Advanced Settings)
        gen_config_obj = OmniVoiceGenerationConfig(
            num_step=int(gen.get("num_steps", _config_int("OMNIVOICE_STEPS", 32))),
            guidance_scale=float(gen.get("guidance_scale", _config_float("OMNIVOICE_GUIDANCE", 3.0))),
            denoise=bool(gen.get("denoise", True)),
            preprocess_prompt=bool(gen.get("preprocess_prompt", True)),
            postprocess_output=bool(gen.get("postprocess_output", True)),
        )

        gen_kwargs: Dict[str, Any] = {
            "text": text,
            "generation_config": gen_config_obj,
        }

        # Взаимоисключающие источники голоса: Design (instruct) > Clone (.pt) > preset.
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
            logger.warning(
                "[%s] Параметр pitch=%s движком не поддерживается — игнорируется.",
                self.name, pitch,
            )

        audio_list = model.generate(**gen_kwargs)
        waveform = self._waveform_to_numpy(audio_list[0])

        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(output), waveform, self.sampling_rate, subtype="PCM_16")
        logger.info("[%s] WAV записан: %s (sr=%s)", self.name, output, self.sampling_rate)
