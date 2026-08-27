"""Асинхронный бескомпромиссный исполнитель FFmpeg и FFprobe команд."""

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, List, Tuple

from app.domain.exceptions import RenderProcessError


class AsyncFFmpegRunner:
    @staticmethod
    async def run(cmd: List[str], desc: str = "FFmpeg", timeout: float = 600.0) -> str:
        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
            if process.returncode != 0:
                err_text = stderr.decode("utf-8", errors="replace").strip()
                raise RenderProcessError(
                    f"FFmpeg ({desc}) завершился с кодом {process.returncode}: {err_text[-500:]}"
                )
            return stdout.decode("utf-8", errors="replace")
        except asyncio.TimeoutError:
            process.kill()
            raise RenderProcessError(f"FFmpeg ({desc}) превысил допустимый лимит времени ({timeout}s)")

    @classmethod
    async def probe_video(cls, file_path: Path | str) -> Dict[str, Any]:
        cmd = [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,duration,r_frame_rate:format=duration",
            "-of",
            "json",
            str(file_path),
        ]
        try:
            raw = await cls.run(cmd, desc="ffprobe")
            data = json.loads(raw)
            stream = data.get("streams", [{}])[0]
            fmt = data.get("format", {})
            dur = stream.get("duration") or fmt.get("duration") or "0"
            return {
                "duration": float(dur),
                "width": int(stream.get("width", 1920)),
                "height": int(stream.get("height", 1080)),
            }
        except Exception:
            return {"duration": 0.0, "width": 1920, "height": 1080}

    @staticmethod
    def get_target_dimensions(resolution: str, format_type: str) -> Tuple[int, int]:
        res_map = {"1080p": (1920, 1080), "1440p": (2560, 1440), "2160p": (3840, 2160)}
        w, h = res_map.get(resolution, (1920, 1080))
        return (h, w) if format_type == "9:16" else (w, h)
