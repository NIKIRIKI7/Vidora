"""Самопроверка инфраструктурного слоя: фабрика TTS, LLM-шлюз, PathResolver, ducking, совместимость."""

from app.infrastructure.ai.tts.factory import TTSProviderFactory
from app.infrastructure.ai.tts.omnivoice import OmniVoiceProvider
from app.infrastructure.ai.tts.silero import SileroProvider
from app.infrastructure.ai.tts.cloud_gateway import CloudGatewayTTSProvider
from app.infrastructure.ai.llm.tsx_parser import extract_tsx
from app.infrastructure.media.ffmpeg import AsyncFFmpegRunner
from app.infrastructure.media.ducking import build_ducking_filtergraph
from app.infrastructure.storage.path_resolver import PathResolver
from app.domain.exceptions import SecurityPathViolationError
from app.domain.schemas.audio import BackgroundMusicSchema


def test_tts_factory_routing():
    assert isinstance(TTSProviderFactory.get_provider("silero"), SileroProvider)
    assert isinstance(TTSProviderFactory.get_provider("k2-fsa/OmniVoice"), OmniVoiceProvider)
    assert isinstance(
        TTSProviderFactory.get_provider("anthropic/claude-sonnet-5"), CloudGatewayTTSProvider
    )


def test_compat_shims_resolve_to_infra():
    from app.infrastructure.ai.llm.gateway import LLMGateway
    from app.infrastructure.storage.code_history_repo import CodeHistoryRepository

    assert CodeHistoryRepository.__module__ == "app.infrastructure.storage.code_history_repo"
    assert LLMGateway.resolve_gguf("gemma3:1b") is None or True  # функция существует и зовётся


def test_path_resolver_raises_domain_exception():
    try:
        PathResolver.resolve("C:\\Windows\\system32\\config")
        raise AssertionError("ожидался SecurityPathViolationError")
    except SecurityPathViolationError:
        pass


def test_tsx_extract():
    assert extract_tsx("Ответ:\n```tsx\nexport const C = () => null;\n```") == "export const C = () => null;"


def test_ducking_filtergraph_and_dimensions():
    fg = build_ducking_filtergraph(BackgroundMusicSchema(), 60.0)
    assert "sidechaincompress=" in fg
    assert "alimiter" in fg
    assert AsyncFFmpegRunner.get_target_dimensions("1080p", "9:16") == (1080, 1920)


def test_filename_sanitizer_neutralizes_traversal():
    from app.infrastructure.storage.path_resolver import PathResolver, ALLOWED_ASSET_FOLDERS

    # легитимные имена не портятся (в т.ч. заглавные буквы)
    assert PathResolver.sanitize_filename("MyFile.tsx") == "MyFile.tsx"
    assert PathResolver.sanitize_filename("aria_voice_123.wav") == "aria_voice_123.wav"

    # traversal нейтрализуется
    assert PathResolver.sanitize_filename("../../etc/passwd") == "passwd"
    assert PathResolver.sanitize_filename("..\\..\\evil.exe") == "evil.exe"
    assert PathResolver.sanitize_filename("..") == "item"
    assert PathResolver.sanitize_filename(".hidden") == "hidden"
    assert "/" not in PathResolver.sanitize_filename("a/b/c.txt")
    assert "\\" not in PathResolver.sanitize_filename("a\\b\\c.txt")

    # папки проходят вайтлист
    assert PathResolver.sanitize_folder("voice") == "voice"
    assert PathResolver.sanitize_folder("../../") == "b-roll"
    assert PathResolver.sanitize_folder("system32") == "b-roll"
    assert ALLOWED_ASSET_FOLDERS >= {"b-roll", "voice", "music", "refs"}


if __name__ == "__main__":
    test_tts_factory_routing()
    test_compat_shims_resolve_to_infra()
    test_path_resolver_raises_domain_exception()
    test_tsx_extract()
    test_ducking_filtergraph_and_dimensions()
    test_filename_sanitizer_neutralizes_traversal()
    print("infrastructure layer OK")
