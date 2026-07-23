import os
import re
import sys
import shutil
import asyncio
import subprocess
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from app.schemas import RenderRequest
from app.ws_manager import manager

router = APIRouter(prefix="/api/v1/render", tags=["render"])
active_renders = {}

REMO_DIR = Path(__file__).resolve().parent.parent.parent / "remotion-project"
SCENE_FILE = REMO_DIR / "src" / "scenes" / "current.tsx"
OUT_DIR = REMO_DIR / "out"

def _resolve_path(path: str, project_path: str = "") -> str:
    if not path:
        return ""
    norm_path = os.path.normpath(path)
    if os.path.isabs(norm_path):
        return norm_path
    
    base_dir = os.getcwd()
    if project_path:
        norm_proj = os.path.normpath(project_path)
        if norm_path == norm_proj or norm_path.startswith(norm_proj + os.sep) or norm_path.startswith(norm_proj + "/"):
            return os.path.normpath(os.path.join(base_dir, norm_path))
        base_dir = os.path.join(base_dir, norm_proj)
        
    return os.path.normpath(os.path.join(base_dir, norm_path))

def run_remotion_sync(task_id: str, req: RenderRequest, loop: asyncio.AbstractEventLoop):
    print(f"\n[RENDER API] === Старт задачи рендера: {task_id} ===")
    npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"
    temp_output = OUT_DIR / f"{task_id}.mp4"
    cmd = [npx_cmd, "remotion", "render", "src/index.ts", "current", f"out/{task_id}.mp4"]

    try:
        if req.tsx_code:
            SCENE_FILE.parent.mkdir(parents=True, exist_ok=True)
            SCENE_FILE.write_text(req.tsx_code, encoding="utf-8")

        OUT_DIR.mkdir(parents=True, exist_ok=True)

        process = subprocess.Popen(
            cmd,
            cwd=str(REMO_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace"
        )
        active_renders[task_id] = process

        output_logs = []
        for line in iter(process.stdout.readline, ""):
            if not line:
                break
            text_line = line.strip()
            if text_line:
                print(f"[REMOTION] {text_line}")
                output_logs.append(text_line)

            match = re.search(r"(\d+)/(\d+)", text_line)
            if match:
                frame, total = int(match.group(1)), int(match.group(2))
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast({
                        "type": "RENDER_PROGRESS",
                        "payload": {"task_id": task_id, "progress": int((frame / total) * 100), "status": "rendering"},
                    }),
                    loop
                )

        process.wait()
        status = "done" if process.returncode == 0 else "error"

        if status == "error":
            print(f"[RENDER API] ОШИБКА РЕНДЕРА:\n" + "\n".join(output_logs[-15:]))

        final_file_path = ""
        if status == "done" and temp_output.exists():
            source_video = temp_output
            resolved_audio = _resolve_path(req.audio_path, req.project_path) if req.audio_path else ""

            if resolved_audio and os.path.exists(resolved_audio):
                merged_output = OUT_DIR / f"{task_id}_merged.mp4"
                print(f"[RENDER API] Склеивание с аудио: {resolved_audio}")
                merge_cmd = [
                    "ffmpeg", "-y",
                    "-i", str(temp_output),
                    "-i", resolved_audio,
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    str(merged_output)
                ]
                res = subprocess.run(merge_cmd, capture_output=True, text=True)
                if res.returncode == 0 and merged_output.exists():
                    source_video = merged_output
                    print("[RENDER API] Видео и аудио успешно объединены!")
                else:
                    print(f"[RENDER API] Ошибка склейки FFmpeg: {res.stderr[:300]}")

            folder_name = "b-roll" if req.target == "b-roll" else "a-roll"
            dest_dir = Path(req.project_path) / "assets" / folder_name
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_file = dest_dir / f"{req.target_id}.mp4"
            shutil.copy2(source_video, dest_file)
            final_file_path = str(dest_file)

        asyncio.run_coroutine_threadsafe(
            manager.broadcast({
                "type": "RENDER_PROGRESS",
                "payload": {
                    "task_id": task_id,
                    "progress": 100,
                    "status": status,
                    "target_id": req.target_id,
                    "target": req.target,
                    "output_path": final_file_path
                }
            }), loop
        )
    except Exception as e:
        print(f"[RENDER API] Exception: {e}")
        asyncio.run_coroutine_threadsafe(
            manager.broadcast({"type": "RENDER_PROGRESS", "payload": {"task_id": task_id, "progress": 100, "status": "error"}}), loop
        )
    finally:
        active_renders.pop(task_id, None)

async def run_remotion(task_id: str, req: RenderRequest):
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, run_remotion_sync, task_id, req, loop)

@router.post("/start")
async def start_render(req: RenderRequest, bg: BackgroundTasks):
    task_id = f"render_{os.urandom(4).hex()}"
    bg.add_task(run_remotion, task_id, req)
    return {"task_id": task_id}

@router.post("/cancel/{task_id}")
async def cancel_render(task_id: str):
    process = active_renders.get(task_id)
    if process:
        try:
            process.terminate()
            active_renders.pop(task_id, None)
            return {"status": "ok", "detail": "Рендер отменен"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка отмены: {str(e)}")
    raise HTTPException(status_code=404, detail="Процесс рендера не найден")

@router.api_route("/media", methods=["GET", "HEAD"])
async def serve_media(path: str):
    resolved = _resolve_path(path)
    if os.path.exists(resolved):
        return FileResponse(resolved)
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail=f"Медиафайл не найден по пути: {path}")
