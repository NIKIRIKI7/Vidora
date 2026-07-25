import os
import psutil
import torch
import subprocess
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/system", tags=["system"])

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
    return {"status": "ok", "detail": "Загрузка началась..."}
