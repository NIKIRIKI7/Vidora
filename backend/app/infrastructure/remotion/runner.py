import asyncio
import multiprocessing
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable, Dict, Optional

from app.core.config import settings
from app.core.logging import add_log
from app.core.process_supervisor import ProcessSupervisor
from app.core.ws import ws_manager
from app.domain.schemas.render import RenderRequest


def composition_id(task_id: str) -> str:
    """Remotion разрешает в id композиции только a-z, A-Z, 0-9, CJK и '-'.
    Внутренний task_id содержит '_', поэтому держим отдельный безопасный id."""
    return task_id.replace("_", "-")


class RemotionRunner:
    _active_renders: Dict[str, subprocess.Popen] = {}
    _semaphore = asyncio.Semaphore(
        int(os.environ.get("VIDORA_MAX_CONCURRENT_RENDERS", "1"))
    )

    @classmethod
    def cancel(cls, task_id: str) -> bool:
        proc = cls._active_renders.pop(task_id, None)
        if proc:
            ProcessSupervisor.stop_process(proc, timeout=2.0)
            return True
        return False

    @classmethod
    async def run(
        cls,
        task_id: str,
        req: RenderRequest,
        job_entry_file: Path,
        out_file: Path,
        on_started: Optional[Callable[[str], None]] = None,
        on_progress: Optional[Callable[[str, str, int], None]] = None,
    ) -> None:
        cores = max(2, min((multiprocessing.cpu_count() or 4) // 2, 6))
        quality = req.render_quality or "medium"
        q_args = ["--scale=1", "--x264-preset=veryfast", "--crf=20"]
        if quality == "low":
            q_args = ["--scale=0.5", "--x264-preset=ultrafast", "--crf=26"]
        elif quality == "high":
            q_args = ["--scale=1", "--x264-preset=slow", "--crf=14"]

        remotion_bin = settings.REMOTION_DIR / "node_modules" / ".bin" / (
            "remotion.cmd" if sys.platform == "win32" else "remotion")
        cmd_base = [str(remotion_bin)] if remotion_bin.exists() else [
            ("npx.cmd" if sys.platform == "win32" else "npx"), "--yes", "remotion"]

        rel_entry = job_entry_file.relative_to(settings.REMOTION_DIR).as_posix()
        rel_out = out_file.relative_to(settings.REMOTION_DIR).as_posix()

        cmd = cmd_base + [
            "render", rel_entry, composition_id(task_id), rel_out,
            "--codec=h264", f"--concurrency={cores}", "--pixel-format=yuv420p",
            "--ignore-audio", "--bundle-cache=true", "--gl=angle",
        ] + q_args

        out_file.parent.mkdir(parents=True, exist_ok=True)

        async with cls._semaphore:
            if on_started:
                on_started(task_id)
            add_log("INFO", "RENDER", f"Запуск remotion [{task_id}]: {' '.join(cmd[-14:])}")
            started = time.time()
            process = subprocess.Popen(
                cmd, cwd=str(settings.REMOTION_DIR), stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace"
            )
            cls._active_renders[task_id] = process
            ProcessSupervisor.register(process, name=f"RemotionRender_{task_id}")
            loop = asyncio.get_running_loop()
            output_logs = []

            def _emit(payload: dict):
                if on_progress:
                    on_progress(task_id, payload.get("status", "rendering"), payload.get("progress", 0))
                asyncio.run_coroutine_threadsafe(ws_manager.broadcast({
                    "type": "RENDER_PROGRESS", "payload": payload
                }), loop)

            def _monitor():
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
                        _emit({
                            "task_id": task_id, "progress": progress, "status": "rendering",
                            "target_id": req.target_id, "target": req.target
                        })
                process.wait()

            try:
                await asyncio.to_thread(_monitor)
            finally:
                cls._active_renders.pop(task_id, None)
                ProcessSupervisor.unregister(process)

            render_sec = round(time.time() - started, 1)

            if process.returncode != 0:
                error_details = "\n".join(output_logs[-30:])
                add_log("ERROR", "RENDER", f"Рендер упал с ошибкой [{task_id}]", details=error_details)
                raise RuntimeError(
                    f"Remotion Render Failed (exit {process.returncode}, {render_sec}s): {error_details[:400]}"
                )
            add_log("INFO", "RENDER", f"Remotion готов [{task_id}] за {render_sec}s")
