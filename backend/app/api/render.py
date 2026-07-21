import os
import re
import sys
import asyncio
import subprocess
from fastapi import APIRouter, BackgroundTasks, HTTPException
from app.schemas import RenderRequest
from app.ws_manager import manager

router = APIRouter(prefix="/api/v1/render", tags=["render"])

active_renders = {}

def run_remotion_sync(task_id: str, req: RenderRequest, loop: asyncio.AbstractEventLoop):
    npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"
    cmd = [npx_cmd, "remotion", "render", "src/index.ts", req.target_id, f"out/{task_id}.mp4"]

    try:
        process = subprocess.Popen(
            cmd,
            cwd=req.project_path or os.getcwd(),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            errors="replace"
        )

        active_renders[task_id] = process

        for line in iter(process.stdout.readline, ""):
            if not line:
                break
            text_line = line.strip()
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

        if process.returncode == 0:
            asyncio.run_coroutine_threadsafe(
                manager.broadcast({
                    "type": "RENDER_PROGRESS",
                    "payload": {"task_id": task_id, "progress": 100, "status": "done"},
                }),
                loop
            )
    except Exception as e:
        print(f"Render error: {e}")
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
