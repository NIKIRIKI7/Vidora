"""Сервис системной информации, логов, ревизий и управления скилами из SQLite."""

import subprocess
import sys
from typing import Any, Dict, List, Optional

import psutil
import torch

from app.core.logging import add_log, get_all_logs
from app.core.process_supervisor import ProcessSupervisor
from app.domain.schemas.code import SaveRevisionRequest
from app.domain.schemas.system import PullRequest
from app.domain.skills.models import SkillCreate, SkillItem, SkillStage, SkillUpdate
from app.infrastructure.db.bootstrap import get_seed_skill
from app.infrastructure.skills.repository import SqliteSkillsRepository
from app.infrastructure.storage.code_history_repo import CodeHistoryRepository


class SystemService:
    def __init__(
        self,
        history_repo: Optional[CodeHistoryRepository] = None,
        skills_repo: Optional[SqliteSkillsRepository] = None,
    ):
        self.history_repo = history_repo or CodeHistoryRepository()
        self.skills_repo = skills_repo

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

    async def list_skills(
        self, process: Optional[str] = None, stage: Optional[str] = None
    ) -> List[SkillItem]:
        stage_enum = None
        if stage and stage in SkillStage._value2member_map_:
            stage_enum = SkillStage(stage)
        elif process and process in SkillStage._value2member_map_:
            stage_enum = SkillStage(process)
        return await self.skills_repo.list_all(stage=stage_enum)

    async def get_skill(self, skill_id: str) -> Optional[SkillItem]:
        return await self.skills_repo.get_by_id(skill_id)

    async def create_skill(self, skill_data: Dict[str, Any]) -> SkillItem:
        return await self.skills_repo.create(SkillCreate.model_validate(skill_data))

    async def update_skill(self, skill_id: str, patch_data: Dict[str, Any]) -> Optional[SkillItem]:
        return await self.skills_repo.update(skill_id, SkillUpdate.model_validate(patch_data))

    async def delete_skill(self, skill_id: str) -> bool:
        return await self.skills_repo.delete(skill_id)

    async def reset_skill(self, skill_id: str) -> Optional[SkillItem]:
        # Сброс к системной версии из seed (полный текст промпта), без затирания других скилов
        seed_item = get_seed_skill(skill_id)
        if not seed_item:
            return None
        existing = await self.skills_repo.get_by_id(skill_id)
        if not existing:
            return None
        return await self.skills_repo.update(
            skill_id,
            SkillUpdate(
                prompt=seed_item["prompt"],
                name=seed_item["name"],
                description=seed_item.get("description", ""),
                is_custom=False,
                is_active=True,
                priority=seed_item.get("priority", existing.priority),
            ),
        )

    async def sync_skills(self) -> Dict[str, Any]:
        skills = await self.skills_repo.list_all()
        return {"status": "ok", "skills": skills}

    def pull_model(self, req: PullRequest) -> None:
        def _spawn(cmd, name: str) -> None:
            proc = subprocess.Popen(cmd)
            ProcessSupervisor.register(proc, name=name)

        if req.engine == "ollama":
            _spawn(["ollama", "pull", "qwen2.5-coder"], "ModelDownload_ollama")
        elif req.engine == "silero":
            torch.hub.load(
                repo_or_dir="snakers4/silero-models",
                model="silero_tts",
                language="ru",
                speaker="v4_ru",
            )
        elif "/" in req.engine:
            try:
                _spawn(["huggingface-cli", "download", req.engine], f"ModelDownload_{req.engine}")
            except FileNotFoundError:
                _spawn([sys.executable, "-m", "huggingface_hub", "download", req.engine],
                       f"ModelDownload_{req.engine}")
        else:
            _spawn(["ollama", "pull", req.engine], f"ModelDownload_{req.engine}")
