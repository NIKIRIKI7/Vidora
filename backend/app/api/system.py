import os
import sys
import psutil
import torch
import subprocess
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.services.remotion_skills import sync_remotion_skills
from app.services.history_logger import (
    add_log,
    get_all_logs,
    save_code_revision,
    get_code_revisions,
    get_code_by_revision,
)

router = APIRouter(prefix="/api/v1/system", tags=["system"])

class SaveRevisionRequest(BaseModel):
    project_id: str = ""
    scene_id: str = ""
    tsx_code: str = ""
    prompt: str = ""

@router.get("/logs")
def get_logs(limit: int = Query(200, ge=1, le=1000)):
    return {"logs": get_all_logs(limit)}

@router.get("/history/{project_id}/{scene_id}")
def list_revisions(project_id: str, scene_id: str):
    return {"revisions": get_code_revisions(project_id, scene_id)}

@router.get("/history/{project_id}/{scene_id}/{revision_id}")
def load_revision(project_id: str, scene_id: str, revision_id: str):
    code = get_code_by_revision(project_id, scene_id, revision_id)
    if not code:
        raise HTTPException(status_code=404, detail="Ревизия не найдена")
    return {"revision_id": revision_id, "tsx_code": code}

@router.post("/history")
def save_revision(req: SaveRevisionRequest):
    if not req.tsx_code or not req.tsx_code.strip():
        raise HTTPException(status_code=400, detail="tsx_code обязателен")
    meta = save_code_revision(req.project_id, req.scene_id, req.tsx_code, req.prompt)
    add_log("INFO", "CODE_SAVE", f"Ручное сохранение версии {meta['revision_id']} для {req.scene_id}")
    return {"ok": True, "meta": meta}

@router.get("/hardware")
def get_hardware():
    try:
        ram_gb = psutil.virtual_memory().total / (1024**3)
        if torch.cuda.is_available():
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024**3)
            device = torch.cuda.get_device_name(0)
            gpu_type = "cuda"
        else:
            vram_gb = 0.0
            device = "CPU"
            gpu_type = "cpu"
        return {"vram_gb": round(vram_gb, 1), "ram_gb": round(ram_gb, 1), "device": device, "gpu_type": gpu_type}
    except Exception:
        return {"vram_gb": 0.0, "ram_gb": 8.0, "device": "Unknown", "gpu_type": "cpu"}

@router.post("/remotion-skills-sync")
def sync_remotion_skills_endpoint():
    try:
        return sync_remotion_skills()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Не удалось получить скиллы: {e}")

class PullRequest(BaseModel):
    engine: str

@router.post("/pull")
def pull_model(req: PullRequest):
    if req.engine == "ollama":
        # ponytail: fire and forget, Ollama daemon handles it
        subprocess.Popen(["ollama", "pull", "qwen2.5-coder"])
    elif req.engine == "silero":
        # ponytail: triggers download to torch cache
        torch.hub.load(repo_or_dir='snakers4/silero-models', model='silero_tts', language='ru', speaker='v4_ru')
    elif "/" in req.engine:
        # Hugging Face модель (например Qwen/Qwen2.5-Coder-7B)
        try:
            subprocess.Popen(["huggingface-cli", "download", req.engine])
        except FileNotFoundError:
            subprocess.Popen([sys.executable, "-m", "huggingface_hub", "download", req.engine])
    else:
        # любой Ollama-тег
        subprocess.Popen(["ollama", "pull", req.engine])
    return {"status": "ok", "detail": "Загрузка началась..."}
