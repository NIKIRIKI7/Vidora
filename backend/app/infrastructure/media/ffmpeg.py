"""Асинхронный бескомпромиссный исполнитель FFmpeg и FFprobe команд."""

import asyncio
import json
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Tuple

from app.domain.exceptions import RenderProcessError


class AsyncFFmpegRunner:
    @staticmethod
    def _run_sync(cmd: List[str], timeout: float) -> subprocess.CompletedProcess:
        return subprocess.run(
            cmd,
            capture_output=True,
            timeout=timeout,
        )

    @classmethod
    async def run(cls, cmd: List[str], desc: str = "FFmpeg", timeout: float = 600.0) -> str:
        try:
            res = await asyncio.to_thread(cls._run_sync, cmd, timeout)
            if res.returncode != 0:
                err_text = res.stderr.decode("utf-8", errors="replace").strip()
                raise RenderProcessError(
                    f"FFmpeg ({desc}) завершился с кодом {res.returncode}: {err_text[-500:]}"
                )
            return res.stdout.decode("utf-8", errors="replace")
        except subprocess.TimeoutExpired:
            raise RenderProcessError(f"FFmpeg ({desc}) превысил допустимый лимит времени ({timeout}s)")
        except Exception as e:
            if isinstance(e, RenderProcessError):
                raise e
            raise RenderProcessError(f"FFmpeg ({desc}) ошибка выполнения: {str(e)}")

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
            raw = await cls.run(cmd, desc="ffprobe", timeout=30.0)
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
