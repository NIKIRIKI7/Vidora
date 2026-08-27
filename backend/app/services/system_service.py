"""Сервис системной информации, логов, ревизий и синхронизации Remotion Skills."""

import subprocess
import sys
from typing import Any, Dict, List, Optional

import psutil
import torch

from app.core.logging import get_all_logs, add_log
from app.domain.schemas.code import SaveRevisionRequest
from app.domain.schemas.system import PullRequest
from app.infrastructure.storage.code_history_repo import CodeHistoryRepository
from app.infrastructure.system.skills import sync_remotion_skills


class SystemService:
    def __init__(self, history_repo: Optional[CodeHistoryRepository] = None):
        self.history_repo = history_repo or CodeHistoryRepository()

    def get_hardware_info(self) -> Dict[str, Any]:
        try:
            ram_gb = psutil.virtual_memory().total / (1024 ** 3)
            if torch.cuda.is_available():
                vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
                device = torch.cuda.get_device_name(0)
                gpu_type = "cuda"
            else:
                vram_gb = 0.0
                device = "CPU"
                gpu_type = "cpu"
            return {
                "vram_gb": round(vram_gb, 1),
                "ram_gb": round(ram_gb, 1),
                "device": device,
                "gpu_type": gpu_type,
            }
        except Exception:
            return {"vram_gb": 0.0, "ram_gb": 8.0, "device": "Unknown", "gpu_type": "cpu"}

    def get_logs(self, limit: int = 200) -> List[Dict[str, Any]]:
        return get_all_logs(limit=limit)

    def list_history(self, project_id: str, scene_id: str) -> List[Dict[str, Any]]:
        return self.history_repo.list_revisions(project_id, scene_id)

    def get_revision_code(
            self, project_id: str, scene_id: str, revision_id: str
    ) -> Optional[str]:
        return self.history_repo.get_revision_code(project_id, scene_id, revision_id)

    def save_revision(self, req: SaveRevisionRequest) -> Dict[str, Any]:
        meta = self.history_repo.save_revision(
            req.project_id, req.scene_id, req.tsx_code, req.prompt
        )
        add_log("INFO", "CODE_SAVE", f"Сохранена ревизия {meta['revision_id']} для {req.scene_id}")
        return meta

    def sync_skills(self) -> Dict[str, Any]:
        return sync_remotion_skills()

    def pull_model(self, req: PullRequest) -> None:
        if req.engine == "ollama":
            subprocess.Popen(["ollama", "pull", "qwen2.5-coder"])
        elif req.engine == "silero":
            torch.hub.load(
                repo_or_dir="snakers4/silero-models",
                model="silero_tts",
                language="ru",
                speaker="v4_ru",
            )
        elif "/" in req.engine:
            try:
                subprocess.Popen(["huggingface-cli", "download", req.engine])
            except FileNotFoundError:
                subprocess.Popen([sys.executable, "-m", "huggingface_hub", "download", req.engine])
        else:
            subprocess.Popen(["ollama", "pull", req.engine])
