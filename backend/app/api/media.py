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
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from app.schemas import AutoBRollRequest, ProcessBRollRequest, BatchAssignBRollRequest

router = APIRouter(prefix="/api/v1/media", tags=["media"])

MUSIC_DIR = Path(__file__).resolve().parents[2] / "assets" / "music"
_AUDIO_EXTS = (".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac")

def _get_target_dimensions(resolution: str, format_type: str) -> tuple[int, int]:
    res_map = {
        "1080p": (1920, 1080),
        "1440p": (2560, 1440),
        "2160p": (3840, 2160),
    }
    w, h = res_map.get(resolution, (1920, 1080))
    if format_type == "9:16":
        return h, w
    return w, h

def _probe_video(file_path: str) -> dict:
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration,r_frame_rate:format=duration",
        "-of", "json",
        file_path
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(res.stdout)
        stream = data.get("streams", [{}])[0]
        fmt = data.get("format", {})

        dur_str = stream.get("duration") or fmt.get("duration") or "0"
        dur = float(dur_str)
        width = int(stream.get("width", 1920))
        height = int(stream.get("height", 1080))

        return {"duration": dur, "width": width, "height": height}
    except Exception as e:
        print(f"[FFPROBE ERROR] {e}")
        return {"duration": 0.0, "width": 1920, "height": 1080}

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

def _normalize_broll_sync(req: ProcessBRollRequest) -> dict:
    source = os.path.normpath(req.source_path)
    if not os.path.isabs(source):
        source = os.path.normpath(os.path.join(os.getcwd(), source))
    if not os.path.exists(source):
        raise FileNotFoundError(f"Исходный видеофайл не найден: {source}")

    project_root = os.path.normpath(req.project_path)
    if not os.path.isabs(project_root):
        project_root = os.path.normpath(os.path.join(os.getcwd(), project_root))
    dest_dir = os.path.join(project_root, "assets", "b-roll")
    voice_dir = os.path.join(project_root, "assets", "voice")
    os.makedirs(dest_dir, exist_ok=True)
    os.makedirs(voice_dir, exist_ok=True)

    meta = _probe_video(source)
    source_dur = meta["duration"]
    target_w, target_h = _get_target_dimensions(req.target_resolution, req.target_format)
    target_dur = req.target_duration if req.target_duration and req.target_duration > 0 else source_dur
    if target_dur <= 0:
        target_dur = 3.0

    slug = re.sub(r'[^a-zA-Z0-9_\-]', '_', req.filename_prefix)[:30]
    out_filename = f"{slug}_{uuid.uuid4().hex[:6]}.mp4"
    out_filepath = os.path.join(dest_dir, out_filename)

    # Построение FFmpeg Filtergraph
    if req.fit_mode == "blur_pad":
        filter_complex = (
            f"[0:v]scale={target_w}:{target_h},boxblur=25:5[bg];"
            f"[0:v]scale={target_w}:{target_h}:force_original_aspect_ratio=decrease[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2[outv]"
        )
    else:
        # Cover mode: центрированный crop
        filter_complex = (
            f"[0:v]scale='if(gt(a,{target_w}/{target_h}),-1,{target_w})':'if(gt(a,{target_w}/{target_h}),{target_h},-1)',"
            f"crop={target_w}:{target_h}[outv]"
        )

    cmd = ["ffmpeg", "-y"]
    if req.loop_if_shorter and source_dur > 0 and target_dur > source_dur:
        cmd.extend(["-stream_loop", "-1"])
    cmd.extend([
        "-ss", "0.0",
        "-t", str(round(target_dur, 3)),
        "-i", source,
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "19",
        "-r", str(req.fps),
        "-pix_fmt", "yuv420p",
    ])

    if req.keep_audio:
        cmd.extend(["-map", "0:a?", "-c:a", "aac", "-b:a", "192k"])
    else:
        cmd.append("-an")

    cmd.append(out_filepath)

    res = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if res.returncode != 0 or not os.path.exists(out_filepath):
        err = res.stderr[-500:] if res.stderr else "Unknown error"
        raise RuntimeError(f"FFmpeg B-Roll processing error: {err}")

    extracted_audio_path = None
    if req.extract_audio:
        audio_filename = f"{slug}_audio_{uuid.uuid4().hex[:6]}.wav"
        extracted_audio_path = os.path.join(voice_dir, audio_filename)
        audio_cmd = [
            "ffmpeg", "-y", "-ss", "0.0", "-t", str(round(target_dur, 3)),
            "-i", source, "-vn", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "1",
            extracted_audio_path
        ]
        audio_res = subprocess.run(audio_cmd, capture_output=True)
        if audio_res.returncode != 0 or not os.path.exists(extracted_audio_path):
            extracted_audio_path = None

    final_dur = _probe_video(out_filepath)["duration"]
    return {
        "status": "ok",
        "filename": out_filename,
        "relative_path": f"assets/b-roll/{out_filename}",
        "absolute_path": os.path.normpath(out_filepath),
        "duration": round(final_dur, 3),
        "width": target_w,
        "height": target_h,
        "fps": req.fps,
        "extracted_audio_path": os.path.normpath(extracted_audio_path) if extracted_audio_path else None,
    }

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

    duration = 0.0
    if file.filename.lower().endswith((".mp4", ".mov", ".mkv", ".webm")):
        duration = _probe_video(file_path)["duration"]

    return {
        "status": "ok",
        "path": file_path,
        "filename": file.filename,
        "url": f"assets/{folder}/{file.filename}",
        "duration": round(duration, 3)
    }

@router.post("/process-broll")
async def process_broll(req: ProcessBRollRequest):
    try:
        res = await asyncio.to_thread(_normalize_broll_sync, req)
        return res
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/batch-assign-broll")
async def batch_assign_broll(req: BatchAssignBRollRequest):
    results = []
    for item in req.items:
        try:
            single_req = ProcessBRollRequest(
                project_path=req.project_path,
                source_path=item.source_path,
                filename_prefix=f"broll_{item.target_id[:8]}",
                target_format=req.target_format,
                target_resolution=req.target_resolution,
                fps=req.fps,
                fit_mode=req.fit_mode,
                target_duration=item.target_duration,
                loop_if_shorter=True
            )
            processed = await asyncio.to_thread(_normalize_broll_sync, single_req)
            results.append({
                "target_id": item.target_id,
                "status": "ok",
                "filename": processed["filename"],
                "relative_path": processed["relative_path"],
                "duration": processed["duration"]
            })
        except Exception as e:
            results.append({
                "target_id": item.target_id,
                "status": "error",
                "detail": str(e)
            })
    return {"status": "ok", "results": results}

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
    dur = _probe_video(file_path)["duration"]
    return {
        "status": "ok",
        "path": file_path,
        "filename": req.filename,
        "url": f"assets/{req.folder}/{req.filename}",
        "duration": round(dur, 3)
    }

def _sync_stream_trim_video(video_url: str, final_filepath: str, target_dur: float):
    trim_cmd = [
        "ffmpeg", "-y",
        "-ss", "0.0",
        "-t", str(target_dur),
        "-i", video_url,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "20",
        "-an",
        final_filepath,
    ]
    subprocess.run(trim_cmd, capture_output=True, check=False)

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
                await asyncio.to_thread(_sync_stream_trim_video, chosen_link, final_filepath, target_dur)
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
                    results.append({"fragment_id": frag_id, "matched": False, "reason": "FFmpeg stream trim failed"})
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
