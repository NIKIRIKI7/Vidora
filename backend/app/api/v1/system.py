"""Контроллер мониторинга железа, логов, версий кода и управления скилами (SQLite)."""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status

from app.api.dependencies import get_system_service
from app.domain.exceptions import ResourceNotFoundError
from app.domain.schemas.code import SaveRevisionRequest
from app.domain.schemas.system import PullRequest
from app.domain.skills.models import SkillCreate, SkillItem, SkillStage, SkillUpdate
from app.services.system_service import SystemService

router = APIRouter(prefix="/system", tags=["System & Management"])


@router.get("/hardware")
def hardware(
    service: SystemService = Depends(get_system_service),
) -> dict:
    return service.get_hardware_info()


@router.get("/logs")
def logs(
    limit: int = Query(200, ge=1, le=1000),
    service: SystemService = Depends(get_system_service),
) -> dict:
    return {"logs": service.get_logs(limit)}


@router.get("/history/{project_id}/{scene_id}")
def list_history(
    project_id: str,
    scene_id: str,
    service: SystemService = Depends(get_system_service),
) -> dict:
    return {"revisions": service.list_history(project_id, scene_id)}


@router.get("/history/{project_id}/{scene_id}/{revision_id}")
def get_revision(
    project_id: str,
    scene_id: str,
    revision_id: str,
    service: SystemService = Depends(get_system_service),
) -> dict:
    code = service.get_revision_code(project_id, scene_id, revision_id)
    if not code:
        raise ResourceNotFoundError(f"Ревизия {revision_id} не найдена")
    return {"revision_id": revision_id, "tsx_code": code}


@router.post("/history")
def save_revision(
    req: SaveRevisionRequest,
    service: SystemService = Depends(get_system_service),
) -> dict:
    meta = service.save_revision(req)
    return {"ok": True, "meta": meta}


@router.get("/skills", response_model=List[SkillItem])
async def get_skills(
    process: Optional[str] = Query(None, description="Фильтр по процессу/стадии пайплайна"),
    stage: Optional[SkillStage] = Query(None, description="Фильтр по стадии (widget_creation, scene_generation и т.д.)"),
    service: SystemService = Depends(get_system_service),
) -> List[SkillItem]:
    skills_data = await service.list_skills(process=process, stage=stage.value if stage else None)
    return skills_data


@router.get("/skills/{skill_id}", response_model=SkillItem)
async def get_single_skill(
    skill_id: str,
    service: SystemService = Depends(get_system_service),
) -> SkillItem:
    skill = await service.get_skill(skill_id)
    if not skill:
        raise ResourceNotFoundError(f"Скил '{skill_id}' не найден")
    return skill


@router.post("/skills", response_model=SkillItem, status_code=status.HTTP_201_CREATED)
async def create_skill(
    req: SkillCreate,
    service: SystemService = Depends(get_system_service),
) -> SkillItem:
    return await service.create_skill(req.model_dump())


@router.put("/skills/{skill_id}", response_model=SkillItem)
async def update_skill(
    skill_id: str,
    req: SkillUpdate,
    service: SystemService = Depends(get_system_service),
) -> SkillItem:
    updated = await service.update_skill(skill_id, req.model_dump(exclude_unset=True))
    if not updated:
        raise ResourceNotFoundError(f"Скил '{skill_id}' не найден")
    return updated


@router.delete("/skills/{skill_id}")
async def delete_skill(
    skill_id: str,
    service: SystemService = Depends(get_system_service),
) -> dict:
    success = await service.delete_skill(skill_id)
    if not success:
        raise ResourceNotFoundError(f"Скил '{skill_id}' не найден")
    return {"status": "ok", "deleted_id": skill_id}


@router.post("/skills/{skill_id}/reset", response_model=SkillItem)
async def reset_skill(
    skill_id: str,
    service: SystemService = Depends(get_system_service),
) -> SkillItem:
    reset_data = await service.reset_skill(skill_id)
    if not reset_data:
        raise ResourceNotFoundError(f"Скил '{skill_id}' не найден")
    return reset_data


@router.post("/remotion-skills-sync")
async def sync_skills(
    service: SystemService = Depends(get_system_service),
) -> dict:
    return await service.sync_skills()


@router.post("/pull")
def pull_model(
    req: PullRequest,
    service: SystemService = Depends(get_system_service),
) -> dict:
    service.pull_model(req)
    return {"status": "ok", "detail": f"Загрузка модели {req.engine} началась в фоне..."}
