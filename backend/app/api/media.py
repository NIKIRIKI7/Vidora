import os
import shutil
import wave
import json
import re
import subprocess
import uuid
import asyncio
import httpx
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form
from pydantic import BaseModel
from app.schemas import AutoBRollRequest

router = APIRouter(prefix="/api/v1/media", tags=["media"])

MUSIC_DIR = Path(__file__).resolve().parents[2] / "assets" / "music"
_AUDIO_EXTS = (".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac")

def _sync_audio_duration(path: str) -> float:
    try:
        with wave.open(path, 'r') as wav:
            return round(wav.getnframes() / float(wav.getframerate()), 2)
    except Exception:
        try:
            out = subprocess.run(
                ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                capture_output=True, text=True,
            )
            dur = out.stdout.strip()
            return round(float(dur), 2) if dur else 0.0
        except Exception:
            return 0.0

class DownloadRequest(BaseModel):
    project_path: str
    url: str
    filename: str
    folder: str = "b-roll"

@router.post("/upload")
async def upload_media(project_path: str = Form(...), folder: str = Form("b-roll"), file: UploadFile = File(...)):
    dest_dir = os.path.realpath(os.path.join(project_path, "assets", folder))
    if not dest_dir.startswith(os.path.realpath(project_path)):
        return {"status": "error", "detail": "invalid path"}
    
    os.makedirs(dest_dir, exist_ok=True)
    file_path = os.path.normpath(os.path.join(dest_dir, file.filename))
    
    def _write():
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
    await asyncio.to_thread(_write)
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
    
    def _write():
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
    await asyncio.to_thread(_write)
    duration = await asyncio.to_thread(_sync_audio_duration, file_path)
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

def _sync_trim_video(temp_filepath: str, final_filepath: str, target_dur: float):
    trim_cmd = [
        "ffmpeg", "-y",
        "-ss", "0.0",
        "-t", str(target_dur),
        "-i", temp_filepath,
        "-c:v", "libx264",
        "-preset", "fast",
        "-crf", "18",
        "-an",
        final_filepath,
    ]
    subprocess.run(trim_cmd, capture_output=True, check=False)
    if os.path.exists(temp_filepath):
        os.remove(temp_filepath)

@router.post("/auto-broll")
async def match_and_trim_broll(req: AutoBRollRequest):
    pexels_key = req.api_keys.get("pexels") or os.environ.get("PEXELS_API_KEY", "")
    if not pexels_key:
        return {"status": "error", "detail": "PEXELS_API_KEY не задан в настройках Vidora или .env бэкенда"}

    project_root = os.path.realpath(req.project_path)
    dest_dir = os.path.realpath(os.path.join(project_root, "assets", "b-roll"))
    if not dest_dir.startswith(project_root):
        return {"status": "error", "detail": "invalid path"}
    os.makedirs(dest_dir, exist_ok=True)

    orientation = "portrait" if req.format == "9:16" else "landscape"
    fragments_payload = []
    for f in req.fragments:
        dur = 3.0
        if f.start_time is not None and f.end_time is not None and f.end_time > f.start_time:
            dur = f.end_time - f.start_time
        elif f.duration and f.duration > 0:
            dur = f.duration
        fragments_payload.append({
            "id": f.id,
            "visual_note": f.visual_note,
            "text": f.text,
            "target_duration": round(dur, 2),
        })

    system_prompt = (
        "You are an expert video editor AI. Given a list of scene fragments with visual notes and voiceover text, "
        "extract concise English search keywords (2-4 words) for Pexels video search for each B-Roll/footage fragment. "
        "Ignore fragments that are explicitly pure code screencasts, terminal displays, or 2D diagrams without real footage. "
        "Return STRICT JSON format: {\"results\": [{\"id\": \"...\", \"is_broll\": true, \"query\": \"...\"}]}"
    )
    user_prompt = f"Analyze these scene fragments:\n{json.dumps(fragments_payload, ensure_ascii=False)}"

    llm_queries = {}
    try:
        if "/" in req.engine:
            from app.services.llm_client import MultiProviderClient
            ai = MultiProviderClient(
                router_key=req.api_keys.get("routerai", ""),
                aitunnel_key=req.api_keys.get("aitunnel", ""),
            )
            raw_llm = await ai.chat(
                model=req.engine,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
            )
        else:
            from app.services.llama_local import local_generate
            raw_llm = await local_generate(req.engine, system_prompt, user_prompt)

        match = re.search(r"\{.*\}", raw_llm or "", re.DOTALL)
        parsed_llm = json.loads(match.group(0)) if match else {"results": []}
        llm_queries = {item["id"]: item for item in parsed_llm.get("results", [])}
    except Exception as e:
        print(f"[AUTO B-ROLL] Ошибка LLM ({req.engine}): {e}")
        llm_queries = {}

    results = []
    async with httpx.AsyncClient(timeout=30.0) as client:
        for frag in fragments_payload:
            frag_id = frag["id"]
            target_dur = frag["target_duration"]
            query_info = llm_queries.get(frag_id, {})
            if query_info.get("is_broll") is False:
                results.append({"fragment_id": frag_id, "matched": False, "reason": "LLM classified as non-broll"})
                continue

            query = query_info.get("query")
            if not query:
                clean_note = re.sub(r"[\*\(\)]", "", frag["visual_note"])
                clean_note = re.sub(r"^(B-roll|Экран|Фон|Визуал):\s*", "", clean_note, flags=re.IGNORECASE)
                query = clean_note[:40].strip()

            if not query:
                results.append({"fragment_id": frag_id, "matched": False, "reason": "Empty search query"})
                continue

            try:
                search_res = await client.get(
                    f"https://api.pexels.com/videos/search?query={query}&per_page=5&orientation={orientation}",
                    headers={"Authorization": pexels_key},
                )
                if search_res.status_code != 200:
                    results.append({"fragment_id": frag_id, "matched": False, "reason": f"Pexels error {search_res.status_code}"})
                    continue

                videos = search_res.json().get("videos", [])
                if not videos:
                    results.append({"fragment_id": frag_id, "matched": False, "reason": f"No stock videos for '{query}'"})
                    continue

                best_video = videos[0]
                video_files = best_video.get("video_files", [])
                chosen_link = None
                for vf in video_files:
                    if vf.get("width") == 1920 or vf.get("height") == 1920:
                        chosen_link = vf.get("link")
                        break
                if not chosen_link and video_files:
                    chosen_link = video_files[0].get("link")

                if not chosen_link:
                    results.append({"fragment_id": frag_id, "matched": False, "reason": "No direct video link"})
                    continue

                clean_slug = re.sub(r"[^a-zA-Z0-9]", "_", query)[:20]
                final_filename = f"broll_{clean_slug}_{uuid.uuid4().hex[:6]}.mp4"
                final_filepath = os.path.join(dest_dir, final_filename)
                temp_filepath = final_filepath + ".tmp.mp4"

                async with client.stream("GET", chosen_link) as dl_resp:
                    if dl_resp.status_code != 200:
                        results.append({"fragment_id": frag_id, "matched": False, "reason": "Download failed"})
                        continue
                    with open(temp_filepath, "wb") as f_out:
                        async for chunk in dl_resp.aiter_bytes():
                            f_out.write(chunk)

                await asyncio.to_thread(_sync_trim_video, temp_filepath, final_filepath, target_dur)

                if os.path.exists(final_filepath) and os.path.getsize(final_filepath) > 1000:
                    results.append({
                        "fragment_id": frag_id,
                        "matched": True,
                        "query_used": query,
                        "filename": final_filename,
                        "file_path": final_filepath,
                        "trimmed_duration": target_dur,
                        "preview_image": best_video.get("image"),
                    })
                else:
                    results.append({"fragment_id": frag_id, "matched": False, "reason": "FFmpeg trimming failed"})
            except Exception as frag_err:
                results.append({"fragment_id": frag_id, "matched": False, "reason": str(frag_err)})

    return {"status": "ok", "results": results}

def _sync_get_music_library(project_path: str):
    categories = []
    if MUSIC_DIR.exists():
        for sub in sorted(MUSIC_DIR.iterdir()):
            if not sub.is_dir():
                continue
            tracks = []
            for f in sorted(sub.iterdir()):
                if f.is_file() and f.suffix.lower() in _AUDIO_EXTS:
                    tracks.append({
                        "id": f.stem,
                        "name": f.stem.replace("_", " ").title(),
                        "duration": _sync_audio_duration(str(f)),
                        "path": f"assets/music/{sub.name}/{f.name}",
                        "is_custom": False,
                    })
            if tracks:
                categories.append({
                    "category": sub.name,
                    "category_title": sub.name.replace("_", " ").title(),
                    "tracks": tracks,
                })

    custom_tracks = []
    if project_path:
        music_dir = os.path.realpath(os.path.join(project_path, "assets", "music"))
        if os.path.isdir(music_dir) and music_dir.startswith(os.path.realpath(project_path)):
            for f in sorted(os.listdir(music_dir)):
                if f.lower().endswith(_AUDIO_EXTS):
                    p = os.path.join(music_dir, f)
                    custom_tracks.append({
                        "id": f"custom_{f}",
                        "name": f,
                        "duration": _sync_audio_duration(p),
                        "path": p,
                        "is_custom": True,
                    })
    return categories, custom_tracks

@router.get("/music-library")
async def get_music_library(project_path: str = ""):
    categories, custom_tracks = await asyncio.to_thread(_sync_get_music_library, project_path)
    return {"status": "ok", "categories": categories, "custom_tracks": custom_tracks}

@router.post("/upload-music")
async def upload_music(project_path: str = Form(...), file: UploadFile = File(...)):
    dest_dir = os.path.realpath(os.path.join(project_path, "assets", "music"))
    if not dest_dir.startswith(os.path.realpath(project_path)):
        return {"status": "error", "detail": "invalid path"}
    
    os.makedirs(dest_dir, exist_ok=True)
    file_path = os.path.normpath(os.path.join(dest_dir, file.filename))
    
    def _write():
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

    await asyncio.to_thread(_write)
    return {"status": "ok", "path": file_path, "filename": file.filename, "url": f"assets/music/{file.filename}"}
