"""Контроллер синтеза речи (TTS), таймингов (WhisperX) и обработки аудио."""

import asyncio
import json
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.api.dependencies import get_audio_service
from app.domain.schemas.audio import (
    AdvancedSilenceRequest,
    AudioConcatRequest,
    AudioGenerationRequest,
    AudioProcessRequest,
    AudioSyncRequest,
    BatchAudioGenerationRequest,
    DuckingPreviewRequest,
    TranscribeRequest,
)
from app.infrastructure.storage.path_resolver import PathResolver
from app.services.audio_service import AudioService

router = APIRouter(prefix="/audio", tags=["Audio & TTS"])


@router.post("/generate")
async def generate_audio(
        request: AudioGenerationRequest,
        service: AudioService = Depends(get_audio_service),
) -> dict:
    return await service.generate_tts(request)


@router.post("/batch-generate")
async def batch_generate_audio(
        request: BatchAudioGenerationRequest,
        service: AudioService = Depends(get_audio_service),
) -> dict:
    return await service.batch_generate_project_audio(request)


@router.post("/batch-upload-scenes")
async def batch_upload_scene_audios(
        project_path: str = Form(...),
        scene_ids: str = Form(..., description='JSON-массив ID сцен по порядку, напр. ["s1","s2"] или CSV'),
        files: List[UploadFile] = File(...),
        service: AudioService = Depends(get_audio_service),
) -> dict:
    try:
        parsed = json.loads(scene_ids)
        parsed_scenes = [str(s) for s in parsed] if isinstance(parsed, list) else []
    except Exception:
        parsed_scenes = [s.strip() for s in scene_ids.split(",") if s.strip()]

    payloads = [(f.filename or "voice.wav", await f.read()) for f in files]
    return await service.batch_assign_scene_audios(
        project_path=project_path,
        scene_ids=parsed_scenes,
        uploaded_files=payloads,
    )


@router.post("/sync")
async def sync_audio(
        request: AudioSyncRequest,
        service: AudioService = Depends(get_audio_service),
) -> dict:
    return await service.sync_alignment(request)


@router.post("/preview-ducking")
async def preview_ducking(
        req: DuckingPreviewRequest,
        service: AudioService = Depends(get_audio_service),
) -> dict:
    out_url = await service.preview_ducking(req)
    return {"status": "ok", "preview_url": out_url}


@router.post("/vram/unload")
async def unload_vram(
        service: AudioService = Depends(get_audio_service),
) -> dict:
    await asyncio.to_thread(service.tts_factory.unload_all)
    return {"status": "ok", "detail": "VRAM полностью очищена"}


@router.post("/upload-ref")
async def upload_ref(
        project_path: str = Form(default="vidora_projects"),
        file: UploadFile = File(...),
) -> dict:
    proj_dir = PathResolver.resolve(project_path) or Path(project_path)
    refs_dir = proj_dir / "assets" / "refs"
    refs_dir.mkdir(parents=True, exist_ok=True)

    file_path = refs_dir / PathResolver.sanitize_filename(file.filename or "ref.wav")
    content = await file.read()
    await asyncio.to_thread(file_path.write_bytes, content)

    return {"status": "ok", "ref_audio_path": str(file_path)}


@router.post("/process")
async def process_audio(
        request: AudioProcessRequest,
        service: AudioService = Depends(get_audio_service),
) -> dict:
    return await service.process_audio_filter(request)


@router.post("/undo")
async def undo_audio(
        request: AudioProcessRequest,
        service: AudioService = Depends(get_audio_service),
) -> dict:
    return await service.undo_audio_filter(request)


@router.post("/transcribe")
async def transcribe_audio(
        req: TranscribeRequest,
        service: AudioService = Depends(get_audio_service),
) -> dict:
    text = await service.transcribe_audio(req.audio_path, req.whisper_model)
    return {"status": "ok", "text": text}


@router.post("/process/advanced-silence")
async def process_advanced_silence(
        req: AdvancedSilenceRequest,
        service: AudioService = Depends(get_audio_service),
) -> dict:
    new_dur = await service.process_advanced_silence(req)
    return {
        "status": "ok",
        "processed_audio_path": req.audio_path,
        "new_duration_sec": round(new_dur, 3),
    }


@router.post("/concat")
async def concat_audio(
        request: AudioConcatRequest,
        service: AudioService = Depends(get_audio_service),
) -> dict:
    out_path = await service.concat_audios(request.audio_paths, request.output_path)
    return {"status": "ok", "output_path": out_path}
