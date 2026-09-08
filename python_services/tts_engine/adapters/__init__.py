"""Реестр плагинов (адаптеров) TTS-движков воркера.

Чтобы добавить новую модель — импортируй её класс и добавь в список
AVAILABLE_ADAPTERS. Новый движок автоматически появится в
GET /api/v1/models и станет доступен для синтеза/клонирования.
"""

from .f5_tts_adapter import F5TTSAdapter  # noqa: F401 — пример, не в REGISTRY
from .omni_voice_adapter import OmniVoiceAdapter

# Список доступных моделей. Первый адаптер — первичный движок воркера.
AVAILABLE_ADAPTERS = [
    OmniVoiceAdapter,  # OmniVoice (k2-fsa), сжатый/квантованный — дефолтный движок
    # F5TTSAdapter,    # <-- раскомментируйте после реализации F5TTSAdapter
]

REGISTRY = {adapter.engine_id: adapter for adapter in AVAILABLE_ADAPTERS}
