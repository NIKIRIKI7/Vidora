import asyncio
import json
import subprocess
from pathlib import Path
from typing import Dict, Any, Tuple


class FFmpegRunner:
    @staticmethod
    def run_sync(cmd: list, desc: str = "ffmpeg") -> str:
        result = subprocess.run(cmd, capture_output=True, text=False)
        stdout = result.stdout.decode("utf-8", errors="replace") if result.stdout else ""
        if result.returncode != 0:
            stderr = result.stderr.decode("utf-8", errors="replace") if result.stderr else "unknown error"
            raise RuntimeError(f"FFmpeg ({desc}) failed: {stderr.strip()[:600]}")
        return stdout

    @classmethod
    async def run_async(cls, cmd: list, desc: str = "ffmpeg") -> str:
        return await asyncio.to_thread(cls.run_sync, cmd, desc)

    @classmethod
    def probe_video(cls, file_path: str | Path) -> Dict[str, Any]:
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration,r_frame_rate:format=duration",
            "-of", "json",
            str(file_path),
        ]
        try:
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(res.stdout)
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

    @staticmethod
    def get_target_dimensions(resolution: str, format_type: str) -> Tuple[int, int]:
        res_map = {"1080p": (1920, 1080), "1440p": (2560, 1440), "2160p": (3840, 2160)}
        w, h = res_map.get(resolution, (1920, 1080))
        return (h, w) if format_type == "9:16" else (w, h)
