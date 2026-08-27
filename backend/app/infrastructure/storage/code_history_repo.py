"""Файловый репозиторий для сохранения ревизий сгенерированного TSX кода."""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.infrastructure.storage.path_resolver import PathResolver


class CodeHistoryRepository:
    def __init__(self, storage_dir: Optional[Path] = None):
        self.root_dir = storage_dir or (settings.DATA_STORAGE_DIR / "code_history")
        self.root_dir.mkdir(parents=True, exist_ok=True)

    def _get_scene_dir(self, project_id: str, scene_id: str) -> Path:
        clean_proj = PathResolver.sanitize_filename(project_id, "default")
        clean_scene = PathResolver.sanitize_filename(scene_id, "scene_unknown")
        # Усекаем до 50 символов, чтобы длинные русскоязычные имена проектов
        # не упирались в лимит длины пути Windows (MAX_PATH).
        proj_slug = clean_proj[:50].rstrip(" ._")
        scene_slug = clean_scene[:50].rstrip(" ._")
        scene_dir = self.root_dir / proj_slug / scene_slug
        scene_dir.mkdir(parents=True, exist_ok=True)
        return scene_dir

    def save_revision(
            self, project_id: str, scene_id: str, tsx_code: str, prompt: str = ""
    ) -> Dict[str, Any]:
        scene_dir = self._get_scene_dir(project_id, scene_id)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        revision_id = f"rev_{timestamp}_{uuid.uuid4().hex[:6]}"

        code_file = scene_dir / f"{revision_id}.tsx"
        code_file.write_text(tsx_code, encoding="utf-8")

        meta = {
            "revision_id": revision_id,
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "prompt_snippet": (prompt[:120] + "...") if len(prompt) > 120 else prompt,
            "char_count": len(tsx_code),
            "file_name": f"{revision_id}.tsx",
        }

        index_file = scene_dir / "versions.json"
        versions = []
        if index_file.exists():
            try:
                versions = json.loads(index_file.read_text(encoding="utf-8"))
            except Exception:
                versions = []
        versions.insert(0, meta)
        index_file.write_text(json.dumps(versions, ensure_ascii=False, indent=2), encoding="utf-8")

        return meta

    def list_revisions(self, project_id: str, scene_id: str) -> List[Dict[str, Any]]:
        scene_dir = self._get_scene_dir(project_id, scene_id)
        index_file = scene_dir / "versions.json"
        if not index_file.exists():
            return []
        try:
            return json.loads(index_file.read_text(encoding="utf-8"))
        except Exception:
            return []

    def get_revision_code(
            self, project_id: str, scene_id: str, revision_id: str
    ) -> Optional[str]:
        scene_dir = self._get_scene_dir(project_id, scene_id)
        safe_rev = PathResolver.sanitize_filename(
            revision_id.removesuffix(".tsx"), "rev_unknown"
        )
        code_file = scene_dir / f"{safe_rev}.tsx"
        return code_file.read_text(encoding="utf-8") if code_file.exists() else None
