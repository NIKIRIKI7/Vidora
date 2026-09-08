"""Пример адаптера F5-TTS (Flow Matching).

Движок НЕ включён в REGISTRY по умолчанию — это пошаговый образец того,
как подключается новая модель. Порядок действий описан в README.md.

Чтобы активировать F5-TTS:
  1. Установите зависимости вашей модели (например, `pip install f5-tts`).
  2. Реализуйте load/unload/clone_voice/synthesize ниже.
  3. В файле `adapters/__init__.py` раскомментируйте F5TTSAdapter в списке
     AVAILABLE_ADAPTERS.
"""

import gc
from typing import Optional

import torch

from .base_engine import BaseVoiceEngine


class F5TTSAdapter(BaseVoiceEngine):
    engine_id = "f5_tts_v1"
    name = "F5-TTS (Flow Matching)"
    capabilities = ["synthesis", "clone"]

    def __init__(self):
        self.model = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"

    def load(self):
        # Эта логика выполнится один раз при первом обращении.
        # Пример: self.model = F5Model.from_pretrained("...", device=self.device)
        raise NotImplementedError(
            "F5TTSAdapter не реализован. См. README.md → 'Как добавить новую модель'."
        )

    def unload(self):
        self.model = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    def clone_voice(
        self,
        ref_audio_path: str,
        output_embedding_path: str,
        ref_text: Optional[str] = None,
    ):
        # 1. Загружаете аудио ref_audio_path
        # 2. Извлекаете вектор/параметры диктора
        # 3. Сохраняете через torch.save(embedding, output_embedding_path)
        raise NotImplementedError()

    def synthesize(
        self,
        text: str,
        embedding_path: Optional[str],
        output_path: str,
        speed: float = 1.0,
        pitch: float = 1.0,
    ):
        # 1. Читаете вектор диктора: embedding = torch.load(embedding_path)
        # 2. Генерируете аудио
        # 3. Сохраняете .wav в output_path
        raise NotImplementedError()
