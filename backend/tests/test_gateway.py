import pytest
from app.infrastructure.ai.llm.gateway import _aitunnel_model
from app.infrastructure.youtube.thumbnail_engine import ThumbnailPromptEngine
from app.utils.audio_utils import to_s2_text, extract_instruct_tag
from app.infrastructure.ai.tts.factory import TTSProviderFactory
from app.infrastructure.ai.tts.omnivoice import OmniVoiceProvider
from app.infrastructure.ai.tts.cloud_gateway import CloudGatewayTTSProvider as GatewayTTSProvider
from app.infrastructure.ai.tts.silero import SileroProvider
from app.infrastructure.ai.tts.cosyvoice import CosyVoiceProvider
from app.infrastructure.ai.tts.local_llm import LocalLLMTTSProvider


def test_aitunnel_model_mapping():
    assert _aitunnel_model("openai/gpt-5.1") == "gpt-5.1"
    assert _aitunnel_model("anthropic/claude-sonnet-5") == "claude-sonnet-5"
    assert _aitunnel_model("google/gemini-3.1-pro-preview") == "gemini-3.1-pro-preview"


def test_thumbnail_json_extractor():
    e = ThumbnailPromptEngine()
    assert e.parse_concept_json('```json\n{"x": 1}\n```') == {"x": 1}
    assert e.parse_concept_json('Вот ответ: {"y": 2}') == {"y": 2}
    fallback = e.parse_concept_json("нет json")
    assert fallback["vidiq_score_estimate"] == 85


def test_s2_and_instruct():
    assert to_s2_text("Привет.", "говори тихо") == "[говори тихо] Привет."
    t, ins = extract_instruct_tag("[instruct: Speak slowly] Сегодня поговорим.")
    assert ins == "Speak slowly" and t == "Сегодня поговорим."


def test_tts_provider_factory():
    factory = TTSProviderFactory
    assert isinstance(factory.get_provider("k2-fsa/OmniVoice"), OmniVoiceProvider)
    assert isinstance(factory.get_provider("snakers4/silero-models"), SileroProvider)
    assert isinstance(factory.get_provider("FunAudioLLM/Fun-CosyVoice3-0.5B"), CosyVoiceProvider)
    assert isinstance(factory.get_provider("openai/tts-1-hd"), GatewayTTSProvider)
    assert isinstance(factory.get_provider("minimax/speech-2.8-hd"), GatewayTTSProvider)
    qd = factory.get_provider("qwen-tts/voice-design")
    assert isinstance(qd, LocalLLMTTSProvider) and qd.mode == "design"
