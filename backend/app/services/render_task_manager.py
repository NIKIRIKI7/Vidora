"""In-memory хранилище статусов задач рендера с TTL (переживает разрыв WebSocket)."""

import threading
import time
from typing import Any, Dict, Optional

TTL_SEC = 3600.0


class RenderTaskManager:
    _tasks: Dict[str, Dict[str, Any]] = {}
    _lock = threading.Lock()

    @classmethod
    def set_status(cls, task_id: str, status: str, progress: int = 0, **kwargs) -> None:
        with cls._lock:
            cls._tasks[task_id] = {
                "task_id": task_id,
                "status": status,
                "progress": progress,
                "updated_at": time.time(),
                **kwargs,
            }

    @classmethod
    def get(cls, task_id: str) -> Optional[Dict[str, Any]]:
        with cls._lock:
            task = cls._tasks.get(task_id)
            if task is None:
                return None
            if time.time() - task.get("updated_at", 0) > TTL_SEC:
                cls._tasks.pop(task_id, None)
                return None
            return dict(task)

    @classmethod
    def prune(cls) -> None:
        with cls._lock:
            stale = [
                tid for tid, t in cls._tasks.items()
                if time.time() - t.get("updated_at", 0) > TTL_SEC
            ]
            for tid in stale:
                cls._tasks.pop(tid, None)
