import os
import shutil
from fastapi import APIRouter, UploadFile, File, Form

router = APIRouter(prefix="/api/v1/media", tags=["media"])

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
