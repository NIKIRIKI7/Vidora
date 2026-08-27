"""Контроллер мониторинга железа, логов, версий кода и Remotion skills."""

from fastapi import APIRouter, Depends, Query

from app.api.dependencies import get_system_service
from app.domain.exceptions import ResourceNotFoundError
from app.domain.schemas.code import SaveRevisionRequest
from app.domain.schemas.system import PullRequest
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


@router.post("/remotion-skills-sync")
def sync_skills(
        service: SystemService = Depends(get_system_service),
) -> dict:
    return service.sync_skills()


@router.post("/pull")
def pull_model(
        req: PullRequest,
        service: SystemService = Depends(get_system_service),
) -> dict:
    service.pull_model(req)
    return {"status": "ok", "detail": f"Загрузка модели {req.engine} началась в фоне..."}
