"""Фасад FFmpeg/FFprobe с обратной совместимостью поверх канонического AsyncFFmpegRunner.

Исполнение команд и обработка ошибок живут в app/infrastructure/media/ffmpeg.py —
единственной точке входа. Здесь сохранён публичный контракт utils (run_sync/run_async,
RuntimeError вместо RenderProcessError), чтобы не ломать существующих вызывающих.
probe_video кэшируется по (путь, mtime, размер): повторный ffprobe для статичных
B-roll не выполняется.
"""

import asyncio
import json
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Tuple

from app.infrastructure.media.ffmpeg import AsyncFFmpegRunner


@lru_cache(maxsize=256)
def _probe_cached(resolved_path: str, mtime_ns: int, size: int) -> Dict[str, Any]:
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration,r_frame_rate:format=duration",
        "-of", "json",
        resolved_path,
    ]
    try:
        res = AsyncFFmpegRunner._run_sync(cmd, timeout=30.0)
        data = json.loads(res.stdout.decode("utf-8", errors="replace"))
        stream = data.get("streams", [{}])[0]
        fmt = data.get("format", {})
        dur_str = stream.get("duration") or fmt.get("duration") or "0"
        return {
            "duration": float(dur_str),
            "width": int(stream.get("width", 1920)),
            "height": int(stream.get("height", 1080)),
        }
    except Exception:
        return {"duration": 0.0, "width": 1920, "height": 1080}


class FFmpegRunner:
    """Bridge-адаптер: сохраняет контракт utils, использует канонический раннер."""

    @staticmethod
    def run_sync(cmd: list, desc: str = "ffmpeg", timeout: float = 600.0) -> str:
        res = AsyncFFmpegRunner._run_sync(cmd, timeout)
        stdout = res.stdout.decode("utf-8", errors="replace") if res.stdout else ""
        if res.returncode != 0:
            stderr = res.stderr.decode("utf-8", errors="replace") if res.stderr else "unknown error"
            raise RuntimeError(f"FFmpeg ({desc}) failed: {stderr.strip()[:600]}")
        return stdout

    @classmethod
    async def run_async(cls, cmd: list, desc: str = "ffmpeg", timeout: float = 600.0) -> str:
        return await asyncio.to_thread(cls.run_sync, cmd, desc, timeout)

    @staticmethod
    def probe_video(file_path: str | Path) -> Dict[str, Any]:
        p = Path(file_path)
        try:
            st = p.stat()
            return _probe_cached(str(p.resolve()), st.st_mtime_ns, st.st_size)
        except OSError:
            return _probe_cached(str(p), 0, 0)

    @staticmethod
    def get_target_dimensions(resolution: str, format_type: str) -> Tuple[int, int]:
        res_map = {"1080p": (1920, 1080), "1440p": (2560, 1440), "2160p": (3840, 2160)}
        w, h = res_map.get(resolution, (1920, 1080))
        return (h, w) if format_type == "9:16" else (w, h)


__all__ = ["FFmpegRunner", "run_sync", "run_async", "probe_video"]


def run_sync(cmd: list, desc: str = "ffmpeg") -> str:
    return FFmpegRunner.run_sync(cmd, desc)


async def run_async(cmd: list, desc: str = "ffmpeg") -> str:
    return await FFmpegRunner.run_async(cmd, desc)


def probe_video(file_path: str | Path) -> Dict[str, Any]:
    return FFmpegRunner.probe_video(file_path)
