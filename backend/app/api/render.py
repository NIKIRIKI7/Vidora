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
from app.services.audio_service import mix_voice_and_music_ducking
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

ALLOWED_ROOTS = [
    BACKEND_DIR.resolve(),
    (Path.cwd() / "vidora_projects").resolve(),
    Path(os.path.expanduser("~")).resolve() / ".cache" / "vidora-models",
    Path(os.environ.get("TEMP", "/tmp")).resolve(),
]

def _is_safe_path(target_path: Path) -> bool:
    try:
        resolved = target_path.resolve()
        return any(
            resolved == root or root in resolved.parents
            for root in ALLOWED_ROOTS
        )
    except Exception:
        return False

MEDIA_EXTENSIONS = {'.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.wav', '.mp3'}

def _is_media_file(p: Path) -> bool:
    return p.is_file() and p.suffix.lower() in MEDIA_EXTENSIONS

def _sanitize(s: str) -> str:
    return re.sub(r'[^a-zA-Z0-9а-яА-ЯёЁ \-_]', '_', s).strip()

def _resolve_path(path: str, project_path: str = "") -> str:
    if not path:
        return ""
    
    p = Path(path)
    if p.is_absolute() and p.exists():
        if _is_safe_path(p):
            return str(p.resolve())

    base = BACKEND_DIR
    candidates = [
        base / path,
        base / project_path / path if project_path else None,
        base / _sanitize(project_path) / path if project_path else None,
        Path.cwd() / path,
        Path.cwd() / project_path / path if project_path else None,
    ]

    for cand in candidates:
        if cand and cand.exists():
            resolved = cand.resolve()
            if _is_safe_path(resolved):
                return str(resolved)

    fallback = (base / path).resolve()
    return str(fallback) if _is_safe_path(fallback) else ""

def _sync_concat_video(list_file: str, out_path: str):
    cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", out_path]
    res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if res.returncode != 0:
        fallback_cmd = ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c:v", "libx264", "-c:a", "aac", "-b:a", "192k", out_path]
        res2 = subprocess.run(fallback_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if res2.returncode != 0:
            raise RuntimeError(f"FFmpeg video concat error: {res2.stderr[-1000:]}")

def _sync_create_export_zip(proj_dir: Path, markdown: str) -> io.BytesIO:
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        zip_file.writestr("SCENARIO.md", markdown)
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
    return zip_buffer

def _prepare_remotion_public_assets(proj_assets: Path, extra_sources: list = None):
    """Прокидывает папку assets проекта в public Remotion, чтобы staticFile() находил b-roll.
    extra_sources — внешние абсолютные пути b-roll (вне проекта): копируются в public/assets/b-roll/."""
    remo_public_assets = REMO_DIR / "public" / "assets"
    remo_public_assets.parent.mkdir(parents=True, exist_ok=True)

    if remo_public_assets.is_symlink():
        if remo_public_assets.resolve() == proj_assets.resolve():
            pass
        else:
            remo_public_assets.unlink()

    if proj_assets.exists():
        if not remo_public_assets.is_symlink() or remo_public_assets.resolve() != proj_assets.resolve():
            try:
                if remo_public_assets.exists() and not remo_public_assets.is_symlink():
                    shutil.rmtree(remo_public_assets, ignore_errors=True)
                os.symlink(str(proj_assets.resolve()), str(remo_public_assets), target_is_directory=True)
            except OSError:
                # ponytail: Windows без Developer Mode не даёт создавать симлинки — копируем только недостающие файлы.
                remo_public_assets.mkdir(parents=True, exist_ok=True)
                for root, _, files in os.walk(str(proj_assets)):
                    for f in files:
                        src = Path(root) / f
                        dst = remo_public_assets / src.relative_to(proj_assets)
                        if not dst.exists():
                            dst.parent.mkdir(parents=True, exist_ok=True)
                            shutil.copy2(str(src), str(dst))

    # Внешние файлы B-Roll копируются под своим именем в public/assets/b-roll/ (совпадает с staticFile("assets/b-roll/<имя>"))
    remo_public_broll = remo_public_assets / "b-roll"
    for src in extra_sources or []:
        p = Path(src)
        if not p.is_file() or p.suffix.lower() not in MEDIA_EXTENSIONS:
            continue
        try:
            remo_public_broll.mkdir(parents=True, exist_ok=True)
            dest = remo_public_broll / p.name
            if not dest.exists() or dest.stat().st_size != p.stat().st_size:
                shutil.copy2(str(p), str(dest))
                print(f"[RENDER] Внешний b-roll скопирован: {src} -> {dest}")
        except Exception as e:
            print(f"[RENDER] Ошибка копирования внешнего b-roll {src}: {e}")

def run_remotion_sync(task_id: str, req: RenderRequest, loop: asyncio.AbstractEventLoop):
    temp_output = OUT_DIR / f"{task_id}.mp4"
    merged_output = OUT_DIR / f"{task_id}_merged.mp4"
    ducked_output = OUT_DIR / f"{task_id}_ducked.wav"

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
        proj_dir = _resolve_path(req.project_path) or str((BACKEND_DIR / req.project_path).resolve())
        _prepare_remotion_public_assets(Path(proj_dir) / "assets", req.broll_sources)

        if req.tsx_code:
            SCENE_FILE.parent.mkdir(parents=True, exist_ok=True)
            SCENE_FILE.write_text(req.tsx_code, encoding="utf-8")

        try:
            from app.services.history_logger import add_log
            add_log("INFO", "RENDER", f"Запуск рендера [{task_id}] target={req.target_id} (project={req.project_path})")
        except Exception:
            pass
        
        OUT_DIR.mkdir(parents=True, exist_ok=True)
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
            error_msg = "Неизвестная ошибка рендера. Смотрите консоль."
            for line in output_logs:
                if "Error:" in line or "Error " in line or "Exception" in line:
                    error_msg = re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', line).strip()
                    break
            # Детальный лог: хвост вывода Remotion (стек ошибки) без ANSI-кодов
            error_details = "\n".join(
                re.sub(r'\x1b\[[0-9;]*[A-Za-z]', '', l).strip()
                for l in output_logs[-100:]
                if l.strip()
            )
            try:
                from app.services.history_logger import add_log
                add_log("ERROR", "RENDER", f"Ошибка рендера [{task_id}] (target={req.target_id}): {error_msg}", details=error_details)
            except Exception:
                pass
            asyncio.run_coroutine_threadsafe(
                manager.broadcast({
                    "type": "RENDER_PROGRESS",
                    "payload": {
                        "task_id": task_id,
                        "progress": 100,
                        "status": "error",
                        "target_id": req.target_id,
                        "target": req.target,
                        "error": error_msg,
                        "error_details": error_details
                    }
                }), loop
            )
            return

        final_file_path = ""
        if status == "done" and temp_output.exists():
            source_video = temp_output
            resolved_audio = _resolve_path(req.audio_path, req.project_path) if req.audio_path else ""

            if resolved_audio and os.path.exists(resolved_audio):
                if req.background_music and req.background_music.enabled:
                    music_file = req.background_music.custom_track_path
                    if not music_file and req.background_music.track_id:
                        music_file = f"assets/music/{req.background_music.track_id}.mp3"
                    resolved_music = _resolve_path(music_file, req.project_path) if music_file else ""

                    if resolved_music and os.path.exists(resolved_music):
                        try:
                            video_dur = 0.0
                            try:
                                probe = subprocess.run(
                                    ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", str(temp_output)],
                                    capture_output=True, text=True,
                                )
                                video_dur = float(probe.stdout.strip()) if probe.stdout.strip() else 0.0
                            except Exception:
                                pass

                            resolved_audio = mix_voice_and_music_ducking(
                                voice_path=resolved_audio,
                                music_path=resolved_music,
                                output_path=str(ducked_output),
                                settings=req.background_music,
                                total_duration=video_dur or None,
                            )
                        except Exception as duck_err:
                            print(f"[RENDER API] Ошибка дакинга: {duck_err}")

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
                res = subprocess.run(merge_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
                if res.returncode == 0 and merged_output.exists():
                    source_video = merged_output
            else:
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
                res = subprocess.run(silent_cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
                if res.returncode == 0 and merged_output.exists():
                    source_video = merged_output

            proj_dir = _resolve_path(req.project_path) or str((BACKEND_DIR / req.project_path).resolve())
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

            try:
                from app.services.history_logger import add_log
                add_log("SUCCESS", "RENDER", f"Рендер завершен [{task_id}] -> {final_file_path}")
            except Exception:
                pass

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
        for tmp in (temp_output, merged_output, ducked_output):
            if tmp.exists():
                try:
                    os.remove(tmp)
                except Exception:
                    pass

async def run_remotion(task_id: str, req: RenderRequest):
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, run_remotion_sync, task_id, req, loop)

@router.post("/start")
async def start_render(req: RenderRequest, bg: BackgroundTasks):
    task_id = f"render_{os.urandom(4).hex()}"
    bg.add_task(run_remotion, task_id, req)
    return {"task_id": task_id}

@router.post("/concat-video")
async def concat_video(req: VideoConcatRequest):
    out_path = _resolve_path(req.output_path, req.project_path)
    if not out_path:
        out_path = str((BACKEND_DIR / req.project_path / req.output_path).resolve())
    
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    list_file = out_path + ".list.txt"
    try:
        with open(list_file, "w", encoding="utf-8") as f:
            for p in req.video_paths:
                abs_p = _resolve_path(p, req.project_path)
                if abs_p and os.path.exists(abs_p):
                    f.write(f"file '{abs_p.replace(os.sep, '/')}'\n")

        await asyncio.to_thread(_sync_concat_video, list_file, out_path)
        return {"status": "ok", "output_path": out_path}
    except Exception as e:
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
    proj_dir_str = _resolve_path(req.project_name) or str((BACKEND_DIR / req.project_name).resolve())
    proj_dir = Path(proj_dir_str)
    
    zip_buffer = await asyncio.to_thread(_sync_create_export_zip, proj_dir, req.markdown)
    encoded_filename = quote(req.project_name + '.zip')
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=utf-8''{encoded_filename}"}
    )

@router.api_route("/media", methods=["GET", "HEAD"])
async def serve_media(path: str):
    if not path:
        raise HTTPException(status_code=400, detail="Path parameter is required")
    
    resolved = _resolve_path(path)
    if not resolved:
        p = Path(path)
        # ponytail: абсолютные пути B-roll вне ALLOWED_ROOTS разрешаем только для существующих медиафайлов.
        # Ceiling: любой существующий медиафайл на машине отдаётся по абсолютному пути; защита — whitelist расширений + is_file().
        if p.is_absolute() and _is_media_file(p):
            resolved = str(p.resolve())
        else:
            raise HTTPException(status_code=403, detail="Доступ запрещен: путь выходит за пределы разрешенных папок")

    if not os.path.exists(resolved):
        raise HTTPException(status_code=404, detail=f"Медиафайл не найден: {path}")

    return FileResponse(resolved)
