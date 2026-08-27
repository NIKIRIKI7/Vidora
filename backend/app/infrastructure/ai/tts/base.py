"""Базовый абстрактный класс для TTS провайдеров (паттерн Strategy)."""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any


class BaseTTSProvider(ABC):
    """Контракт для провайдеров синтеза речи."""

    @abstractmethod
    async def generate_tts(
            self,
            text: str,
            voice_model: str,
            output_path: Path,
            **kwargs: Any,
    ) -> None:
        """Синтезирует аудиофайл и сохраняет его по output_path."""
        pass

    @classmethod
    def unload_model(cls) -> None:
        """Освобождает VRAM и системную память."""
        pass
