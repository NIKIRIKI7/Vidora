import gc
import logging
import threading
from typing import Optional

from adapters import REGISTRY
from adapters.base_engine import BaseVoiceEngine

logger = logging.getLogger("tts_engine.vram")


def _empty_torch_cache() -> None:
    """Опциональная очистка CUDA-кэша. GGUF-режим (CrispASR) не требует PyTorch."""
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:  # noqa: BLE001 — torch не установлен/недоступен
        pass


class VramManager:
    """Менеджер ленивой загрузки и вытеснения моделей из GPU.

    В VRAM одновременно держится ровно один движок. Если C# (или другой
    клиент) запросил другой движок — текущий выгружается, память очищается.
    Работает как лениво: веса поднимаются при первом обращении, а не при
    старте воркера.
    """

    def __init__(self) -> None:
        self._active_engine: Optional[BaseVoiceEngine] = None
        self._lock = threading.RLock()

    def _release(self, engine: BaseVoiceEngine) -> None:
        engine_id = getattr(engine, "engine_id", "?")
        try:
            engine.unload()
            logger.info("[VramManager] Движок '%s' выгружен из VRAM.", engine_id)
        except Exception:  # noqa: BLE001
            logger.exception("[VramManager] Ошибка при выгрузке движка '%s'.", engine_id)
        _empty_torch_cache()
        gc.collect()

    def get_engine(self, engine_id: str) -> BaseVoiceEngine:
        with self._lock:
            if engine_id not in REGISTRY:
                raise ValueError(f"Движок '{engine_id}' не найден в реестре.")

            # Если нужная модель уже в памяти — отдаём её.
            if self._active_engine is not None and self._active_engine.engine_id == engine_id:
                return self._active_engine

            # Если в памяти висит другая модель — выгружаем её.
            if self._active_engine is not None:
                self._release(self._active_engine)
                self._active_engine = None

            # Создаём инстанс адаптера и загружаем веса в VRAM.
            adapter_class = REGISTRY[engine_id]
            new_engine = adapter_class()
            new_engine.load()

            self._active_engine = new_engine
            logger.info("[VramManager] Активный движок: '%s'.", engine_id)
            return self._active_engine

    def unload_all(self) -> None:
        with self._lock:
            if self._active_engine is not None:
                self._release(self._active_engine)
                self._active_engine = None
            logger.info("[VramManager] VRAM полностью очищена.")


# Синглтон. FastAPI-роутеры обращаются именно к нему.
vram_manager = VramManager()
