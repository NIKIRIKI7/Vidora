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

def run_remotion_sync(task_id: str, req: RenderRequest, loop: asyncio.AbstractEventLoop):
    print(f"\n[RENDER API] === Старт задачи рендера: {task_id} ===")
    print(f"[RENDER API] Проект: {req.project_id}, цель: {req.target} ({req.target_id})")
    
    npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"
    temp_output = OUT_DIR / f"{task_id}.mp4"
    cmd = [npx_cmd, "remotion", "render", "src/index.ts", "current", f"out/{task_id}.mp4"]
    
    try:
        if req.tsx_code:
            print(f"[RENDER API] Запись TSX кода ({len(req.tsx_code)} симв.) в {SCENE_FILE}")
            SCENE_FILE.parent.mkdir(parents=True, exist_ok=True)
            SCENE_FILE.write_text(req.tsx_code, encoding="utf-8")
            
            try:
                folder_name = "b-roll" if req.target == "b-roll" else "a-roll"
                code_dir = Path(req.project_path) / "code" / folder_name
                code_dir.mkdir(parents=True, exist_ok=True)
                code_file = code_dir / f"{req.target_id}.tsx"
                code_file.write_text(req.tsx_code, encoding="utf-8")
                print(f"[RENDER API] Копия TSX сохранена в проект: {code_file}")
            except Exception as code_err:
                print(f"[RENDER API] Ошибка сохранения TSX в папку проекта: {code_err}")

        OUT_DIR.mkdir(parents=True, exist_ok=True)
        print(f"[RENDER API] Команда: {' '.join(cmd)}")
        print(f"[RENDER API] Рабочая директория: {REMO_DIR}")

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
                progress_pct = int((frame / total) * 100) if total > 0 else 0
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast({
                        "type": "RENDER_PROGRESS",
                        "payload": {"task_id": task_id, "progress": progress_pct, "status": "rendering"},
                    }),
                    loop
                )

        process.wait()
        print(f"[RENDER API] Процесс Remotion завершился с кодом: {process.returncode}")

        status = "done" if process.returncode == 0 else "error"
        if status == "error":
            print(f"[RENDER API] ОШИБКА: Рендер {task_id} завершился сбоем!")
            print("[RENDER API] Последние строки вывода Remotion:\n" + "\n".join(output_logs[-15:]))

        final_file_path = ""
        if status == "done" and temp_output.exists():
            folder_name = "b-roll" if req.target == "b-roll" else "a-roll"
            dest_dir = Path(req.project_path) / "assets" / folder_name
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_file = dest_dir / f"{req.target_id}.mp4"
            shutil.copy2(temp_output, dest_file)
            final_file_path = str(dest_file)
            print(f"[RENDER API] Готовое видео скопировано в: {final_file_path}")

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
        print(f"[RENDER API] Исключение во время рендера {task_id}: {e}")
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
    print(f"[RENDER API] Получен запрос на рендер. Создана задача: {task_id}")
    bg.add_task(run_remotion, task_id, req)
    return {"task_id": task_id}

@router.post("/cancel/{task_id}")
async def cancel_render(task_id: str):
    process = active_renders.get(task_id)
    if process:
        try:
            process.terminate()
            active_renders.pop(task_id, None)
            print(f"[RENDER API] Рендер {task_id} отменен пользователем.")
            return {"status": "ok", "detail": "Рендер отменен"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Ошибка отмены: {str(e)}")
    raise HTTPException(status_code=404, detail="Процесс рендера не найден")

@router.get("/media")
async def serve_media(path: str):
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail="Медиафайл не найден")
