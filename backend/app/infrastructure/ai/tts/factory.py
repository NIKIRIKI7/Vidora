"""Фабрика создания и жизненного цикла TTS провайдеров (Abstract Factory / Registry)."""

from typing import Optional, Type

from app.infrastructure.ai.audio_tools.enhancer import LavaSREnhancer
from app.infrastructure.ai.tts.base import BaseTTSProvider
from app.infrastructure.ai.tts.cloud_gateway import CloudGatewayTTSProvider
from app.infrastructure.ai.tts.cosyvoice import CosyVoiceProvider
from app.infrastructure.ai.tts.fish_audio import FishAudioS2Provider
from app.infrastructure.ai.tts.local_llm import LocalLLMTTSProvider, _LOCAL_TTS_ENGINES
from app.infrastructure.ai.tts.omnivoice import OmniVoiceProvider
from app.infrastructure.ai.tts.silero import SileroProvider


class TTSProviderFactory:
    _active_provider_class: Optional[Type[BaseTTSProvider]] = None

    @classmethod
    def get_provider(cls, engine: Optional[str]) -> BaseTTSProvider:
        engine_str = (engine or "").strip()
        engine_lower = engine_str.lower()

        if "omnivoice" in engine_lower or engine_lower == "k2-fsa/omnivoice":
            provider_cls = OmniVoiceProvider
        elif "silero" in engine_lower:
            provider_cls = SileroProvider
        elif "cosyvoice" in engine_lower:
            provider_cls = CosyVoiceProvider
        elif "fish" in engine_lower or "s2" in engine_lower:
            provider_cls = FishAudioS2Provider
        elif engine_str in _LOCAL_TTS_ENGINES:
            cfg = _LOCAL_TTS_ENGINES[engine_str]
            return LocalLLMTTSProvider(
                engine=cfg["engine"],
                python=cfg["python"],
                model=cfg["model"],
                mode=cfg["mode"],
                codec=cfg.get("codec"),
            )
        elif "/" in engine_str or engine_lower in ("openai", "elevenlabs"):
            return CloudGatewayTTSProvider(model=engine_str)
        else:
            provider_cls = OmniVoiceProvider

        # Если сменился класс провайдера — выгружаем предыдущий из памяти
        if cls._active_provider_class and cls._active_provider_class != provider_cls:
            cls._active_provider_class.unload_model()

        cls._active_provider_class = provider_cls
        return provider_cls()

    @classmethod
    def unload_all(cls) -> None:
        """Полная очистка VRAM ото всех локальных моделей."""
        if cls._active_provider_class:
            cls._active_provider_class.unload_model()
            cls._active_provider_class = None
        CosyVoiceProvider.unload_model()
        OmniVoiceProvider.unload_model()
        SileroProvider.unload_model()
        FishAudioS2Provider.unload_model()
        LocalLLMTTSProvider.unload_model()
        LavaSREnhancer.unload_model()
