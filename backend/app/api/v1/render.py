"""Контроллер запуска рендеринга Remotion, конкатенации видео и экспорта проекта."""

import os
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import FileResponse, StreamingResponse

from app.api.dependencies import get_render_service
from app.domain.exceptions import ResourceNotFoundError, SecurityPathViolationError
from app.domain.schemas.render import ExportRequest, RenderRequest, VideoConcatRequest
from app.infrastructure.remotion.runner import RemotionRunner
from app.infrastructure.storage.path_resolver import PathResolver
from app.services.render_service import RenderService
from app.services.render_task_manager import RenderTaskManager

router = APIRouter(prefix="/render", tags=["Render Pipeline"])


@router.post("/start")
async def start_render(
        req: RenderRequest,
        bg: BackgroundTasks,
        service: RenderService = Depends(get_render_service),
) -> dict:
    task_id = f"render_{os.urandom(4).hex()}"
    RenderTaskManager.set_status(
        task_id, "queued", 0, target_id=req.target_id, target=req.target
    )
    bg.add_task(service.execute_render_pipeline, task_id, req)
    return {"task_id": task_id}


@router.get("/status/{task_id}")
async def render_status(task_id: str) -> dict:
    status = RenderTaskManager.get(task_id)
    if not status:
        raise ResourceNotFoundError(f"Задача рендера не найдена или истёк TTL: {task_id}")
    return status


@router.post("/cancel/{task_id}")
async def cancel_render(task_id: str) -> dict:
    cancelled = RemotionRunner.cancel(task_id)
    if cancelled:
        RenderTaskManager.set_status(task_id, "cancelled", 100)
    return {"status": "ok" if cancelled else "not_found"}


@router.post("/concat-video")
async def concat_video(
        req: VideoConcatRequest,
        service: RenderService = Depends(get_render_service),
) -> dict:
    out_path = await service.concat_videos(req)
    return {"status": "ok", "output_path": out_path}


@router.post("/export")
async def export_project(
        req: ExportRequest,
        service: RenderService = Depends(get_render_service),
) -> StreamingResponse:
    zip_buffer = await service.export_project_zip(req)
    encoded_filename = quote(req.project_name + ".zip")
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=utf-8''{encoded_filename}"},
    )


@router.api_route("/media", methods=["GET", "HEAD"])
async def serve_media(path: str) -> FileResponse:
    if not path:
        raise ResourceNotFoundError("Параметр path обязателен")

    resolved = PathResolver.resolve(path)
    if not resolved:
        candidate = PathResolver.resolve(path, must_exist=False)
        from pathlib import Path
        p = Path(path)
        if p.is_absolute() and PathResolver.is_media_file(p) and PathResolver.is_safe_path(p):
            resolved = p.resolve()
        else:
            raise SecurityPathViolationError("Доступ запрещен: путь выходит за пределы разрешенной директории")

    if not resolved or not resolved.exists():
        raise ResourceNotFoundError(f"Медиафайл не найден: {path}")

    return FileResponse(str(resolved))
