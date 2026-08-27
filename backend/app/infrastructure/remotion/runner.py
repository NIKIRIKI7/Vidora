import asyncio
import multiprocessing
import re
import subprocess
import sys
from pathlib import Path

from app.core.config import settings
from app.core.logging import add_log
from app.core.ws import ws_manager
from app.domain.schemas.render import RenderRequest


class RemotionRunner:
    _active_renders: dict = {}

    @classmethod
    def cancel(cls, task_id: str) -> bool:
        proc = cls._active_renders.pop(task_id, None)
        if proc:
            try:
                proc.terminate()
                return True
            except Exception:
                pass
        return False

    @classmethod
    async def run(cls, task_id: str, req: RenderRequest, scene_file: Path, out_file: Path):
        cores = max(2, min((multiprocessing.cpu_count() or 4) // 2, 6))
        quality = req.render_quality or "medium"
        q_args = ["--scale=1", "--x264-preset=veryfast", "--crf=20"]
        if quality == "low":
            q_args = ["--scale=0.5", "--x264-preset=ultrafast", "--crf=26"]
        elif quality == "high":
            q_args = ["--scale=1", "--x264-preset=slow", "--crf=14"]

        remotion_bin = settings.REMOTION_DIR / "node_modules" / ".bin" / (
            "remotion.cmd" if sys.platform == "win32" else "remotion")
        cmd_base = [str(remotion_bin)] if remotion_bin.exists() else [("npx.cmd" if sys.platform == "win32" else "npx"),
                                                                      "--yes", "remotion"]
        cmd = cmd_base + [
            "render", "src/index.ts", "current", f"out/{task_id}.mp4",
            "--codec=h264", f"--concurrency={cores}", "--pixel-format=yuv420p",
            "--ignore-audio", "--bundle-cache=true", "--gl=angle",
        ] + q_args

        out_file.parent.mkdir(parents=True, exist_ok=True)
        process = subprocess.Popen(
            cmd, cwd=str(settings.REMOTION_DIR), stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace"
        )
        cls._active_renders[task_id] = process

        loop = asyncio.get_running_loop()
        output_logs = []

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
                    asyncio.run_coroutine_threadsafe(
                        ws_manager.broadcast({
                            "type": "RENDER_PROGRESS",
                            "payload": {
                                "task_id": task_id, "progress": progress, "status": "rendering",
                                "target_id": req.target_id, "target": req.target
                            }
                        }), loop
                    )
            process.wait()

        await asyncio.to_thread(_monitor)
        cls._active_renders.pop(task_id, None)

        if process.returncode != 0:
            error_details = "\n".join(output_logs[-30:])
            add_log("ERROR", "RENDER", f"Рендер упал с ошибкой [{task_id}]", details=error_details)
            raise RuntimeError(f"Remotion Render Failed: {error_details[:300]}")
