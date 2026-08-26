import json
import uuid
from collections import deque
from datetime import datetime
from pathlib import Path
from typing import Optional

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
DATA_DIR = BACKEND_DIR / "data_storage"
CODE_HISTORY_DIR = DATA_DIR / "code_history"
LOGS_FILE = DATA_DIR / "app_events.jsonl"

CODE_HISTORY_DIR.mkdir(parents=True, exist_ok=True)

# Хранилище последних логов в памяти + персист в JSONL.
_memory_logs = deque(maxlen=1000)


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def add_log(level: str, module: str, message: str, details: Optional[str] = None) -> dict:
    entry = {
        "id": uuid.uuid4().hex[:8],
        "timestamp": _now(),
        "level": level.upper(),
        "module": module,
        "message": message,
        "details": details,
    }
    _memory_logs.appendleft(entry)
    try:
        with open(LOGS_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass
    return entry


def get_all_logs(limit: int = 200) -> list:
    return list(_memory_logs)[:max(0, limit)]


def save_code_revision(project_id: str, scene_id: str, tsx_code: str, prompt: str = "") -> dict:
    """Сохраняет версию TSX-кода анимации в data_storage/code_history/..."""
    scene_dir = CODE_HISTORY_DIR / (project_id or "default") / (scene_id or "scene_unknown")
    scene_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    revision_id = f"rev_{timestamp}_{uuid.uuid4().hex[:6]}"
    code_file = scene_dir / f"{revision_id}.tsx"
    code_file.write_text(tsx_code, encoding="utf-8")

    index_file = scene_dir / "versions.json"
    versions = []
    if index_file.exists():
        try:
            versions = json.loads(index_file.read_text(encoding="utf-8"))
        except Exception:
            versions = []
        if not isinstance(versions, list):
            versions = []

    meta = {
        "revision_id": revision_id,
        "timestamp": _now(),
        "prompt_snippet": (prompt[:120] + "...") if len(prompt) > 120 else prompt,
        "char_count": len(tsx_code),
        "file_name": f"{revision_id}.tsx",
    }
    versions.insert(0, meta)
    index_file.write_text(json.dumps(versions, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta


def get_code_revisions(project_id: str, scene_id: str) -> list:
    index_file = CODE_HISTORY_DIR / (project_id or "default") / (scene_id or "scene_unknown") / "versions.json"
    if not index_file.exists():
        return []
    try:
        return json.loads(index_file.read_text(encoding="utf-8"))
    except Exception:
        return []


def get_code_by_revision(project_id: str, scene_id: str, revision_id: str) -> Optional[str]:
    code_file = CODE_HISTORY_DIR / (project_id or "default") / (scene_id or "scene_unknown") / f"{revision_id}.tsx"
    if code_file.exists():
        return code_file.read_text(encoding="utf-8")
    return None
