"""Парсер и санитайзер ответов языковых моделей для Remotion TSX кода."""

import re


def extract_tsx(data: str) -> str:
    """Извлекает чистый TSX код из Markdown-блоков ответов LLM."""
    if not data:
        return ""
    match = re.search(r"```(?:tsx|typescript|jsx|javascript)?\s*(.*?)\s*```", data, re.DOTALL)
    if match:
        return match.group(1).strip()
    if "```" in data:
        return data.split("```", 1)[1].lstrip().strip()
    return data.strip()


def has_tsx_markers(data: str) -> bool:
    """Проверяет наличие признаков TSX/Remotion кода в строке."""
    return bool(
        data
        and ("```" in data or "<div" in data or "import {" in data or "remotion" in data.lower())
    )
