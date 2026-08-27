"""Динамический резолвер AI-движка для YouTube-пайплайна (облако / встроенный GGUF / авто)."""

from typing import Any, Dict, Optional, Tuple

from app.core.config import settings

CLOUD_PROVIDERS_INDICATORS = (
    "anthropic", "claude", "openai", "gpt-", "routerai", "aitunnel",
    "google", "gemini", "deepseek", "qwen/qwen-2.5-72b", "minimax"
)


def is_cloud_engine(engine_str: str) -> bool:
    if not engine_str:
        return False
    e = engine_str.lower().strip()
    if "/" in e or e in ("claude", "openai", "routerai_gpt4o", "routerai_claude", "aitunnel"):
        return True
    return any(ind in e for ind in CLOUD_PROVIDERS_INDICATORS)


def resolve_youtube_engine(
    requested_engine: Optional[str] = None,
    api_keys: Optional[Dict[str, Any]] = None,
) -> Tuple[str, bool]:
    """
    Интеллектуальный выбор AI-движка:
    - Явно переданный локальный движок (напр. 'gemma3:4b') -> встроенный GGUF.
    - Явно запрошенное облако -> облачная модель.
    - 'auto' с облачными ключами -> лучший облачный провайдер.
    - Иначе -> встроенная модель Vidora (gemma3:4b, резолвится в ai-models/*.gguf).
    """
    keys = api_keys or {}
    router_key = keys.get("routerai") or settings.ROUTERAI_API_KEY
    aitunnel_key = keys.get("aitunnel") or settings.AITUNNEL_API_KEY
    anthropic_key = keys.get("anthropic") or settings.ANTHROPIC_API_KEY
    openai_key = keys.get("openai") or settings.OPENAI_API_KEY

    req = (requested_engine or "").strip()

    # 1. Явно передан локальный движок
    if req and not is_cloud_engine(req) and req.lower() not in ("auto", "default", "cloud"):
        return req, False

    # 2. Явно запрошено облако
    if req and is_cloud_engine(req):
        return req, True

    # 3. 'auto' + облачные ключи
    if router_key:
        return "anthropic/claude-sonnet-4-20250514", True
    if aitunnel_key:
        return "openai/gpt-4o", True
    if anthropic_key:
        return "claude", True
    if openai_key:
        return "openai", True

    # 4. Встроенная модель Vidora (резолвится в ai-models/*.gguf через LLMGateway.resolve_gguf)
    return "gemma3:4b", False
