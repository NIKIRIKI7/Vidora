"""Слой обратной совместимости: канонический PathResolver живёт в core.

Примитивы песочницы (security) — функция уровня ядра, поэтому логика перенесена
в app/core/path_resolver.py, а здесь остаётся только реэкспорт для существующих импортов.
"""

from app.core.path_resolver import ALLOWED_ASSET_FOLDERS, MEDIA_EXTENSIONS, PathResolver  # noqa: F401

__all__ = ["PathResolver", "MEDIA_EXTENSIONS", "ALLOWED_ASSET_FOLDERS"]
