import json
import uuid
from collections import deque
from datetime import datetime
from typing import Optional, List

from app.core.config import settings

_memory_logs = deque(maxlen=1000)
LOGS_FILE = settings.DATA_STORAGE_DIR / "app_events.jsonl"
settings.DATA_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


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


def get_all_logs(limit: int = 200) -> List[dict]:
    return list(_memory_logs)[:max(0, limit)]
