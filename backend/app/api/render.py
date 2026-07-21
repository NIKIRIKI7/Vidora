import os
import re
import sys
import asyncio
import subprocess
from fastapi import APIRouter, BackgroundTasks
from app.schemas import RenderRequest
from app.ws_manager import manager

router = APIRouter(prefix="/api/v1/render", tags=["render"])

async def run_remotion(task_id: str, req: RenderRequest):
    npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"
    cmd = [npx_cmd, "remotion", "render", "src/index.ts", req.target_id, f"out/{task_id}.mp4"]
    process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=req.project_path or os.getcwd(),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    while True:
        line = await process.stdout.readline()
        if not line:
            break
        text = line.decode(errors="replace").strip()
        match = re.search(r"(\d+)/(\d+)", text)
        if match:
            frame, total = int(match.group(1)), int(match.group(2))
            await manager.broadcast({
                "type": "RENDER_PROGRESS",
                "payload": {"task_id": task_id, "progress": int((frame / total) * 100), "status": "rendering"},
            })

    await process.wait()
    await manager.broadcast({
        "type": "RENDER_PROGRESS",
        "payload": {"task_id": task_id, "progress": 100, "status": "done"},
    })

@router.post("/start")
async def start_render(req: RenderRequest, bg: BackgroundTasks):
    task_id = f"render_{os.urandom(4).hex()}"
    bg.add_task(run_remotion, task_id, req)
    return {"task_id": task_id}
