"""Менеджер безопасного разрешения путей файловой системы и защиты от Path Traversal."""

import os
import re
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.domain.exceptions import SecurityPathViolationError

MEDIA_EXTENSIONS = {
    ".mp4",
    ".webm",
    ".mov",
    ".mkv",
    ".avi",
    ".m4v",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".wav",
    ".mp3",
    ".m4a",
    ".aac",
    ".ogg",
    ".flac",
}

ALLOWED_ASSET_FOLDERS = {"b-roll", "voice", "music", "refs", "a-roll", "data", "preview", "code"}


class PathResolver:
    @staticmethod
    def is_safe_path(target_path: Path) -> bool:
        """Проверяет, входит ли путь в список разрешенных корневых директорий."""
        try:
            resolved = target_path.resolve()
            return any(
                resolved == root or root in resolved.parents for root in settings.allowed_roots
            )
        except Exception:
            return False

    @staticmethod
    def _strip_projects_prefix(p_str: str) -> str:
        """Убирает ведущий projects/ или projects\\ во избежание projects/projects/..."""
        return re.sub(r"^projects[\\/]", "", str(p_str).strip(), flags=re.IGNORECASE)

    @classmethod
    def resolve(
            cls, path_str: str, project_path: str = "", must_exist: bool = False
    ) -> Optional[Path]:
        """Безопасно разрешает путь к файлу с проверкой песочницы."""
        if not path_str or not str(path_str).strip():
            return None

        p = Path(path_str)
        if p.is_absolute():
            resolved = p.resolve()
            if cls.is_safe_path(resolved):
                if must_exist and not resolved.exists():
                    return None
                return resolved
            raise SecurityPathViolationError(
                f"Доступ запрещен: путь выходит за пределы sandbox ({path_str})"
            )

        clean_path = cls._strip_projects_prefix(path_str)
        clean_proj = cls._strip_projects_prefix(project_path) if project_path else ""

        candidates = []

        if clean_proj:
            norm_proj = Path(clean_proj)
            norm_path = Path(clean_path)
            # Приоритет у единой папки projects/
            candidates.append(settings.PROJECTS_DIR / norm_proj / norm_path)
            candidates.append(norm_proj / norm_path)
            candidates.append(settings.BASE_DIR / norm_proj / norm_path)
        else:
            norm_path = Path(clean_path)
            candidates.append(settings.PROJECTS_DIR / norm_path)
            candidates.append(settings.BASE_DIR / norm_path)
            candidates.append(Path.cwd() / norm_path)

        for cand in candidates:
            if cand.exists():
                resolved = cand.resolve()
                if cls.is_safe_path(resolved):
                    return resolved

        if must_exist:
            return None

        # Fallback по умолчанию — всегда внутри projects/
        if clean_proj:
            fallback = (settings.PROJECTS_DIR / Path(clean_proj) / Path(clean_path)).resolve()
        else:
            fallback = (settings.PROJECTS_DIR / Path(clean_path)).resolve()
        if cls.is_safe_path(fallback):
            return fallback

        return None

    @staticmethod
    def sanitize_filename(name: str, default: str = "item") -> str:
        """
        Полностью нейтрализует попытки Path Traversal в имени файла:
        удаляет слэши, пути ../, управляющие символы, начальные/конечные точки и пробелы.
        """
        if not name or not str(name).strip():
            return default
        s = os.path.basename(os.path.normpath(str(name).strip()))
        cleaned = re.sub(r'[\x00-\x1f\x7f\\/:*?"<>|]', "_", s).strip(" .")
        cleaned = re.sub(r"^\.+", "", cleaned).strip(" .")
        return cleaned if cleaned else default

    @staticmethod
    def sanitize_folder(folder: str, default: str = "b-roll") -> str:
        """Проверяет и санитизирует имя вложенной папки ассетов."""
        clean = PathResolver.sanitize_filename(folder, default=default)
        return clean if clean in ALLOWED_ASSET_FOLDERS else default

    @staticmethod
    def is_media_file(p: Path) -> bool:
        """Проверяет существование файла и допустимость его расширения."""
        return p.is_file() and p.suffix.lower() in MEDIA_EXTENSIONS
