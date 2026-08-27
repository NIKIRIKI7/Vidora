"""Контроллер медиа-ассетов, B-Roll обработки, стоков Pexels и Auto B-Roll."""

import asyncio

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.dependencies import get_media_service
from app.domain.schemas.media import (
    AutoBRollRequest,
    BatchAssignBRollRequest,
    DownloadRequest,
    ProcessBRollRequest,
)
from app.infrastructure.storage.path_resolver import PathResolver
from app.services.media_service import MediaService

router = APIRouter(prefix="/media", tags=["Media & B-Roll"])


@router.post("/upload")
async def upload_media(
        project_path: str = Form(...),
        folder: str = Form("b-roll"),
        file: UploadFile = File(...),
        service: MediaService = Depends(get_media_service),
) -> dict:
    content = await file.read()
    return await service.save_uploaded_media(
        project_path=project_path,
        folder=folder,
        filename=file.filename or "media_upload.mp4",
        content=content,
    )


@router.post("/process-broll")
async def process_broll(
        req: ProcessBRollRequest,
        service: MediaService = Depends(get_media_service),
) -> dict:
    return await service.normalize_broll(req)


@router.post("/batch-assign-broll")
async def batch_assign_broll(
        req: BatchAssignBRollRequest,
        service: MediaService = Depends(get_media_service),
) -> dict:
    results = []
    for item in req.items:
        try:
            safe_target = PathResolver.sanitize_filename(item.target_id)
            single_req = ProcessBRollRequest(
                project_path=req.project_path,
                source_path=item.source_path,
                filename_prefix=f"broll_{safe_target[:8]}",
                target_format=req.target_format,
                target_resolution=req.target_resolution,
                fps=req.fps,
                fit_mode=req.fit_mode,
                target_duration=item.target_duration,
                loop_if_shorter=True,
            )
            processed = await service.normalize_broll(single_req)
            results.append({
                "target_id": item.target_id,
                "status": "ok",
                "filename": processed["filename"],
                "relative_path": processed["relative_path"],
                "duration": processed["duration"],
            })
        except Exception as e:
            results.append({"target_id": item.target_id, "status": "error", "detail": str(e)})
    return {"status": "ok", "results": results}


@router.post("/upload-audio")
async def upload_audio(
        project_path: str = Form(...),
        target_id: str = Form(...),
        file: UploadFile = File(...),
        service: MediaService = Depends(get_media_service),
) -> dict:
    content = await file.read()
    safe_target = PathResolver.sanitize_filename(target_id)
    safe_name = PathResolver.sanitize_filename(file.filename or "audio.wav")
    filename = f"Custom_{safe_target}_{safe_name}"
    res = await service.save_uploaded_media(project_path, "voice", filename, content)
    return {"status": "ok", "path": res["path"], "duration": res.get("duration", 0.0)}


@router.get("/search-stock")
async def search_stock(
        query: str,
        per_page: int = 15,
        orientation: str = "portrait",
        service: MediaService = Depends(get_media_service),
) -> dict:
    return await service.search_pexels_stock(query, per_page, orientation)


@router.post("/download-stock")
async def download_stock(
        req: DownloadRequest,
        service: MediaService = Depends(get_media_service),
) -> dict:
    return await service.download_pexels_stock(req)


@router.post("/auto-broll")
async def auto_broll(
        req: AutoBRollRequest,
        service: MediaService = Depends(get_media_service),
) -> dict:
    return await service.auto_broll(req)


@router.get("/music-library")
async def music_library(
        project_path: str = "",
        service: MediaService = Depends(get_media_service),
) -> dict:
    categories, custom_tracks = await asyncio.to_thread(service.scan_music_library, project_path)
    return {"status": "ok", "categories": categories, "custom_tracks": custom_tracks}


@router.post("/upload-music")
async def upload_music(
        project_path: str = Form(...),
        file: UploadFile = File(...),
        service: MediaService = Depends(get_media_service),
) -> dict:
    content = await file.read()
    return await service.save_uploaded_media(
        project_path=project_path,
        folder="music",
        filename=file.filename or "music.mp3",
        content=content,
    )
