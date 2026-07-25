import os
import shutil
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
