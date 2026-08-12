import os
import re
import sys
import io
import zipfile
import shutil
import asyncio
import subprocess
import multiprocessing
from pathlib import Path
from typing import List
from urllib.parse import quote
from pydantic import BaseModel
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from app.schemas import RenderRequest
from app.ws_manager import manager

router = APIRouter(prefix="/api/v1/render", tags=["render"])

active_renders = {}

class VideoConcatRequest(BaseModel):
    project_path: str
    video_paths: List[str]
    output_path: str

class ExportRequest(BaseModel):
    project_name: str
    markdown: str

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
REMO_DIR = BACKEND_DIR / "remotion-project"
SCENE_FILE = REMO_DIR / "src" / "scenes" / "current.tsx"
OUT_DIR = REMO_DIR / "out"

def _sanitize(s: str) -> str:
    return re.sub(r'[^a-zA-Z0-9а-яА-ЯёЁ \-_]', '_', s).strip()

def _resolve_path(path: str, project_path: str = "") -> str:
    if not path:
        return ""
    norm_path = os.path.normpath(path)
    if os.path.isabs(norm_path) and os.path.exists(norm_path):
        return norm_path

    base = str(BACKEND_DIR)

    # 1. Прямой путь относительно BACKEND_DIR
    c1 = os.path.normpath(os.path.join(base, norm_path))
    if os.path.exists(c1):
        return c1

    # 2. Относительно project_path
    if project_path:
        norm_proj = os.path.normpath(project_path)
        c2 = os.path.normpath(os.path.join(base, norm_proj, norm_path))
        if os.path.exists(c2):
            return c2

        parts = norm_path.split(os.sep)
        if len(parts) > 1:
            sub_path = os.path.join(*parts[1:])
            c3 = os.path.normpath(os.path.join(base, norm_proj, sub_path))
            if os.path.exists(c3):
                return c3

            sanitized_proj = _sanitize(norm_proj)
            c4 = os.path.normpath(os.path.join(base, sanitized_proj, sub_path))
            if os.path.exists(c4):
                return c4

    parts = norm_path.split(os.sep)
    if len(parts) > 1:
        sanitized_first = _sanitize(parts[0])
        c5 = os.path.normpath(os.path.join(base, sanitized_first, *parts[1:]))
        if os.path.exists(c5):
            return c5

    return c1

def run_remotion_sync(task_id: str, req: RenderRequest, loop: asyncio.AbstractEventLoop):
    print(f"\n[RENDER API] === Старт задачи рендера: {task_id} ===")
    print(f"[RENDER API] Target ID: {req.target_id} | Target: {req.target}")
    print(f"[RENDER API] Project Path: '{req.project_path}'")
    print(f"[RENDER API] Audio Path: '{req.audio_path}'")

    temp_output = OUT_DIR / f"{task_id}.mp4"
    merged_output = OUT_DIR / f"{task_id}_merged.mp4"
    cores = max(1, (multiprocessing.cpu_count() or 4) - 1)

    remotion_bin = REMO_DIR / "node_modules" / ".bin" / ("remotion.cmd" if sys.platform == "win32" else "remotion")
    if remotion_bin.exists():
        cmd = [str(remotion_bin), "render", "src/index.ts", "current", f"out/{task_id}.mp4",
               "--codec=h264", f"--concurrency={cores}"]
    else:
        npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"
        cmd = [npx_cmd, "--yes", "remotion", "render", "src/index.ts", "current", f"out/{task_id}.mp4",
               "--codec=h264", f"--concurrency={cores}"]

    try:
        if req.tsx_code:
            SCENE_FILE.parent.mkdir(parents=True, exist_ok=True)
            SCENE_FILE.write_text(req.tsx_code, encoding="utf-8")

        OUT_DIR.mkdir(parents=True, exist_ok=True)
        print(f"[RENDER API] Запуск Remotion CLI (UTF-8)...")

        process = subprocess.Popen(
            cmd,
            cwd=str(REMO_DIR),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
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
                progress = int((frame / total) * 100) if total > 0 else 0
                asyncio.run_coroutine_threadsafe(
                    manager.broadcast({
                        "type": "RENDER_PROGRESS",
                        "payload": {
                            "task_id": task_id,
                            "progress": progress,
                            "status": "rendering",
                            "target_id": req.target_id,
                            "target": req.target
                        },
                    }),
                    loop
                )

        process.wait()
        status = "done" if process.returncode == 0 else "error"

        if status == "error":
            print(f"[RENDER API] ❌ ОШИБКА РЕНДЕРА REMOTION:\n" + "\n".join(output_logs[-20:]))
            
            # Извлекаем понятный текст ошибки для UI
            error_msg = "Неизвестная ошибка рендера. Смотрите консоль."
            for line in output_logs:
                if "Error:" in line or "Error " in line or "Exception" in line:
                    # ponytail: режем ANSI-escape-коды, иначе LLM получает мусор в промпт автофикса
                    error_msg = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', line).strip()
                    break

            asyncio.run_coroutine_threadsafe(
                manager.broadcast({
                    "type": "RENDER_PROGRESS",
                    "payload": {
                        "task_id": task_id,
                        "progress": 100,
                        "status": "error",
                        "target_id": req.target_id,
                        "target": req.target,
                        "error": error_msg
                    }
                }), loop
            )
            return

        final_file_path = ""
        if status == "done" and temp_output.exists():
            source_video = temp_output
            resolved_audio = _resolve_path(req.audio_path, req.project_path) if req.audio_path else ""
            print(f"[RENDER API] Поиск аудио для объединения: '{resolved_audio}' (существует: {os.path.exists(resolved_audio)})")

            if resolved_audio and os.path.exists(resolved_audio):
                print(f"[RENDER API] 🎵 Склеивание с аудио через FFmpeg...")
                merge_cmd = [
                    "ffmpeg", "-y",
                    "-i", str(temp_output),
                    "-i", resolved_audio,
                    "-map", "0:v",
                    "-map", "1:a",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-apad",
                    "-shortest",
                    str(merged_output)
                ]
                res = subprocess.run(
                    merge_cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace"
                )
                print(f"[RENDER API] FFmpeg stdout: {res.stdout}")
                print(f"[RENDER API] FFmpeg stderr: {res.stderr}")
                if res.returncode == 0 and merged_output.exists():
                    source_video = merged_output
                    print("[RENDER API] ✅ Видео и аудио успешно объединены в MP4!")
                else:
                    print(f"[RENDER API] ⚠️ Ошибка склейки FFmpeg: {res.stderr[:500]}")
            else:
                print(f"[RENDER API] 🔇 Аудио не найдено, добавление тихой дорожки...")
                silent_cmd = [
                    "ffmpeg", "-y",
                    "-i", str(temp_output),
                    "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=48000",
                    "-map", "0:v",
                    "-map", "1:a",
                    "-c:v", "copy",
                    "-c:a", "aac",
                    "-b:a", "192k",
                    "-shortest",
                    str(merged_output)
                ]
                res = subprocess.run(
                    silent_cmd,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace"
                )
                if res.returncode == 0 and merged_output.exists():
                    source_video = merged_output
                    print(f"[RENDER API] ✅ Тихая аудиодорожка успешно добавлена!")

            proj_dir = _resolve_path(req.project_path)
            if req.target == "project":
                dest_dir = Path(proj_dir) / "preview"
            elif req.target == "b-roll":
                dest_dir = Path(proj_dir) / "assets" / "b-roll"
            else:
                dest_dir = Path(proj_dir) / "assets" / "a-roll"

            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_file = dest_dir / f"{req.target_id}.mp4"
            shutil.copy2(source_video, dest_file)
            final_file_path = str(dest_file)
            print(f"[RENDER API] ✅ Файл успешно сохранен в папку проекта: {final_file_path}")

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
        print(f"[RENDER API] ❌ Exception в фоновой задаче рендера: {e}")
        import traceback
        traceback.print_exc()
        asyncio.run_coroutine_threadsafe(
            manager.broadcast({
                "type": "RENDER_PROGRESS",
                "payload": {
                    "task_id": task_id,
                    "progress": 100,
                    "status": "error",
                    "target_id": req.target_id,
                    "target": req.target,
                    "error": f"Internal Error: {str(e)}"
                }
            }), loop
        )
    finally:
        active_renders.pop(task_id, None)
        try:
            if temp_output.exists():
                os.remove(temp_output)
            if merged_output.exists():
                os.remove(merged_output)
            print(f"[RENDER API] 🧹 Временные файлы задачи {task_id} удалены.")
        except Exception as clean_err:
            print(f"[RENDER API] Не удалось удалить временный файл: {clean_err}")

async def run_remotion(task_id: str, req: RenderRequest):
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, run_remotion_sync, task_id, req, loop)

@router.post("/start")
async def start_render(req: RenderRequest, bg: BackgroundTasks):
    task_id = f"render_{os.urandom(4).hex()}"
    print(f"\n[RENDER API] Получен запрос на рендер -> Task ID: {task_id}")
    bg.add_task(run_remotion, task_id, req)
    return {"task_id": task_id}

@router.post("/concat-video")
async def concat_video(req: VideoConcatRequest):
    out_path = _resolve_path(req.output_path, req.project_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    list_file = out_path + ".list.txt"
    try:
        with open(list_file, "w", encoding="utf-8") as f:
            for p in req.video_paths:
                abs_p = _resolve_path(p, req.project_path)
                if os.path.exists(abs_p):
                    formatted_p = abs_p.replace("\\", "/")
                    f.write(f"file '{formatted_p}'\n")

        cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", out_path]
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if res.returncode != 0:
            fallback_cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c:v", "libx264", "-c:a", "aac", "-b:a", "192k", out_path]
            res2 = subprocess.run(fallback_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
            if res2.returncode != 0:
                raise RuntimeError(f"FFmpeg video concat error: {res2.stderr[-1000:]}")

        return {"status": "ok", "output_path": out_path}
    except Exception as e:
        print(f"[RENDER API] ❌ Ошибка склейки видео: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(list_file):
            os.remove(list_file)

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

@router.post("/export")
async def export_project(req: ExportRequest):
    proj_dir = Path(_resolve_path(req.project_name))
    zip_buffer = io.BytesIO()

    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("SCENARIO.md", req.markdown)

        folders_to_ensure = [
            "assets/a-roll", "assets/b-roll", "assets/voice",
            "code/a-roll", "music", "preview", "out"
        ]
        for folder in folders_to_ensure:
            zipinfo = zipfile.ZipInfo(folder + "/")
            zip_file.writestr(zipinfo, "")

        if proj_dir.exists():
            for root, _, files in os.walk(proj_dir):
                for file in files:
                    file_path = Path(root) / file
                    arcname = file_path.relative_to(proj_dir)
                    zip_file.write(file_path, str(arcname))

    zip_buffer.seek(0)
    encoded_filename = quote(req.project_name + '.zip')
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=utf-8''{encoded_filename}"}
    )

@router.api_route("/media", methods=["GET", "HEAD"])
async def serve_media(path: str):
    resolved = _resolve_path(path)
    if os.path.exists(resolved):
        return FileResponse(resolved)
    if os.path.exists(path):
        return FileResponse(path)
    raise HTTPException(status_code=404, detail=f"Медиафайл не найден по пути: {path}")
