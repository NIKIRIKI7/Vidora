"""Адаптер локальной модели OmniVoice."""

import asyncio
import concurrent.futures
import gc
import logging
import os
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

from app.core.config import settings
from app.infrastructure.ai.tts.base import BaseTTSProvider
from app.utils.audio_utils import extract_instruct_tag, clean_voice_tags


class OmniVoiceProvider(BaseTTSProvider):
    _model = None
    _thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    _VOICE_MAP = {
        "aria": "female, young adult, moderate pitch",
        "marcus": "male, middle-aged, low pitch",
        "nova": "female, young adult, high pitch",
    }

    @classmethod
    def unload_model(cls) -> None:
        if cls._model is not None:
            del cls._model
            cls._model = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    @classmethod
    def _get_model(cls):
        if cls._model is None:
            from omnivoice import OmniVoice

            logging.getLogger("omnivoice").setLevel(logging.INFO)
            os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
            local_path = settings.AI_MODELS_DIR / "OmniVoice"
            checkpoint = str(local_path) if local_path.exists() else "k2-fsa/OmniVoice"
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if device == "cuda" else torch.float32

            cls._model = OmniVoice.from_pretrained(
                checkpoint,
                device_map=device,
                dtype=dtype,
                load_asr=True,
                token=False,
            )
        return cls._model

    async def generate_tts(
            self, text: str, voice_model: str, output_path: Path, **kwargs
    ) -> None:
        model = self._get_model()
        from omnivoice import OmniVoiceGenerationConfig

        gen_config = OmniVoiceGenerationConfig(
            num_step=int(kwargs.get("num_steps", 32) or 32),
            guidance_scale=float(kwargs.get("guidance_scale", 3.0) or 3.0),
            denoise=bool(kwargs.get("denoise", True)),
            preprocess_prompt=bool(kwargs.get("preprocess_prompt", True)),
            postprocess_output=bool(kwargs.get("postprocess_output", True)),
        )

        clean_text, inline_instruct = extract_instruct_tag(text)
        clean_text = clean_voice_tags(clean_text)
        if not clean_text or not clean_text.strip():
            raise ValueError("Текст для озвучки пуст после очистки тегов.")

        gen_kwargs = {"text": clean_text.strip(), "generation_config": gen_config}
        speed = float(kwargs.get("speed", 1.0) or 1.0)
        if speed != 1.0:
            gen_kwargs["speed"] = speed
        duration = float(kwargs.get("duration", 0.0) or 0.0)
        if duration > 0.0:
            gen_kwargs["duration"] = duration

        if voice_model == "clone":
            ref_audio = kwargs.get("ref_audio_path")
            if not ref_audio or not os.path.exists(ref_audio):
                raise ValueError("Для клонирования требуется существующий аудио-референс.")
            gen_kwargs["voice_clone_prompt"] = model.create_voice_clone_prompt(
                ref_audio=ref_audio,
                ref_text=kwargs.get("ref_text") or None,
            )
        else:
            instruct = (
                    inline_instruct
                    or kwargs.get("design_prompt")
                    or self._VOICE_MAP.get(voice_model, voice_model)
            )
            gen_kwargs["instruct"] = str(instruct)

        loop = asyncio.get_running_loop()
        audio_list = await loop.run_in_executor(
            self._thread_pool, lambda: model.generate(**gen_kwargs)
        )
        waveform = audio_list[0].squeeze()

        if hasattr(waveform, "detach"):
            waveform = waveform.detach()
        if hasattr(waveform, "cpu"):
            waveform = waveform.cpu()
        if hasattr(waveform, "numpy"):
            waveform = waveform.numpy()

        waveform = np.asarray(waveform, dtype=np.float32)
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sample_rate = int(getattr(model, "sampling_rate", 24000) or 24000)
        sf.write(str(output_path), waveform, sample_rate, subtype="PCM_16")
