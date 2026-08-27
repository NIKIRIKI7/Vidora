"""Адаптер компактной русской модели Silero TTS."""

import gc
from pathlib import Path

import torch
import torchaudio

from app.infrastructure.ai.tts.base import BaseTTSProvider
from app.utils.audio_utils import clean_voice_tags


class SileroProvider(BaseTTSProvider):
    _model = None

    @classmethod
    def _get_model(cls):
        if cls._model is None:
            cls._model = torch.hub.load(
                repo_or_dir="snakers4/silero-models",
                model="silero_tts",
                language="ru",
                speaker="v4_ru",
                trust_repo=True,
            )
        return cls._model

    @classmethod
    def unload_model(cls) -> None:
        if cls._model is not None:
            del cls._model
            cls._model = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    async def generate_tts(
            self, text: str, voice_model: str, output_path: Path, **kwargs
    ) -> None:
        model = self._get_model()
        sample_rate = 48000
        speaker = "kseniya" if voice_model in ("", "aria") else voice_model
        audio = model.apply_tts(
            text=clean_voice_tags(text), speaker=speaker, sample_rate=sample_rate
        )

        if audio.dim() == 1:
            audio = audio.unsqueeze(0)

        out = Path(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        torchaudio.save(str(out), audio, sample_rate)
