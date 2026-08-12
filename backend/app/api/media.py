import os
import shutil
import wave
import httpx
from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1/media", tags=["media"])

class DownloadRequest(BaseModel):
    project_path: str
    url: str
    filename: str
    folder: str = "b-roll"

@router.post("/upload")
async def upload_media(project_path: str = Form(...), folder: str = Form("b-roll"), file: UploadFile = File(...)):
    # ponytail: path traversal guard via os.path.realpath and prefix check
    dest_dir = os.path.realpath(os.path.join(project_path, "assets", folder))
    if not dest_dir.startswith(os.path.realpath(project_path)):
        return {"status": "error", "detail": "invalid path"}
    os.makedirs(dest_dir, exist_ok=True)
    file_path = os.path.normpath(os.path.join(dest_dir, file.filename))
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {
        "status": "ok", 
        "path": file_path, 
        "filename": file.filename, 
        "url": f"assets/{folder}/{file.filename}"
    }

@router.post("/upload-audio")
async def upload_audio(project_path: str = Form(...), target_id: str = Form(...), file: UploadFile = File(...)):
    dest_dir = os.path.realpath(os.path.join(project_path, "assets", "voice"))
    if not dest_dir.startswith(os.path.realpath(project_path)):
        return {"status": "error", "detail": "invalid path"}
    os.makedirs(dest_dir, exist_ok=True)
    file_path = os.path.normpath(os.path.join(dest_dir, f"Custom_{target_id}_{file.filename}"))
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    duration = 0.0
    try:
        with wave.open(file_path, 'r') as wav:
            duration = wav.getnframes() / float(wav.getframerate())
    except Exception:
        # mp3-референс — длительность через ffprobe
        try:
            import subprocess
            out = subprocess.run(
                ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", file_path],
                capture_output=True, text=True,
            )
            dur = out.stdout.strip()
            duration = float(dur) if dur else 0.0
        except Exception:
            duration = 0.0
    return {"status": "ok", "path": file_path, "duration": duration}

@router.get("/search-stock")
async def search_stock(query: str, per_page: int = 15, orientation: str = "portrait"):
    api_key = os.environ.get("PEXELS_API_KEY", "")
    if not api_key:
        return {"status": "error", "detail": "PEXELS_API_KEY не задан в файле .env на бэкенде"}

    async with httpx.AsyncClient() as client:
        res = await client.get(
            f"https://api.pexels.com/videos/search?query={query}&per_page={per_page}&orientation={orientation}",
            headers={"Authorization": api_key},
            timeout=15.0
        )
        if res.status_code != 200:
            return {"status": "error", "detail": f"Ошибка Pexels API: {res.status_code}"}
        return {"status": "ok", "videos": res.json().get("videos", [])}

@router.post("/download-stock")
async def download_stock(req: DownloadRequest):
    dest_dir = os.path.join(req.project_path, "assets", req.folder)
    os.makedirs(dest_dir, exist_ok=True)
    file_path = os.path.normpath(os.path.join(dest_dir, req.filename))
    
    async with httpx.AsyncClient() as client:
        async with client.stream("GET", req.url) as response:
            if response.status_code != 200:
                return {"status": "error", "detail": "Cannot download file"}
            with open(file_path, "wb") as f:
                async for chunk in response.aiter_bytes():
                    f.write(chunk)
                    
    return {
        "status": "ok",
        "path": file_path,
        "filename": req.filename,
        "url": f"assets/{req.folder}/{req.filename}"
    }
