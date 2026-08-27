import asyncio
import concurrent.futures
import json
import os
import re
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import httpx

from app.core.config import settings
from app.infrastructure.ai.tts.base import BaseTTSProvider
from app.utils.audio_utils import to_s2_text


class FishAudioS2Provider(BaseTTSProvider):
    """Fish Audio S2 Pro через аудио-cpp сервер (audiocpp_server.exe) с OpenAI-совместимым
    POST /v1/audio/speech. Сервер держит модель в памяти; thread_pool сериализует."""
    MODEL_ID = "fish-s2"
    _proc = None
    _base_url = None
    _thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    @classmethod
    def _find_gguf(cls):
        explicit = os.environ.get("VIDORA_S2_MODEL")
        if explicit:
            return explicit
        home = os.path.join(Path.home(), "ai-models")
        for directory in (home, str(settings.AI_MODELS_DIR)):
            if not os.path.isdir(directory):
                continue
            for p in sorted(Path(directory).glob("*.gguf")):
                n = p.stem.lower()
                if "s2" in n or "fish" in n:
                    return str(p)
        return None

    @classmethod
    def _prep_ref(cls, path, max_seconds: float = 8.0):
        if not path or not os.path.exists(path):
            return path
        import subprocess, tempfile
        dst = os.path.join(tempfile.gettempdir(),
                           "vidora_s2_ref_" + os.path.splitext(os.path.basename(path))[0] + ".wav")
        subprocess.run(
            ["ffmpeg", "-y", "-i", path, "-t", str(max_seconds), "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", dst],
            capture_output=True, check=False,
        )
        return dst if os.path.exists(dst) and os.path.getsize(dst) > 0 else path

    @staticmethod
    def _trim_ref_text(text, max_chars: int = 120):
        if not text:
            return text
        text = text.strip()
        m = re.match(r"[^.!?…]*[.!?…]?", text)
        first = (m.group(0) if m else "").strip()
        return (first or text)[:max_chars].rstrip()

    @classmethod
    def _paths(cls):
        base = settings.BASE_DIR
        exe = os.environ.get("VIDORA_S2_BIN")
        if not exe:
            for d in (os.path.join(Path.home(), "ai-models", "audiocpp"), str(settings.AI_MODELS_DIR / "audiocpp")):
                candidate = os.path.join(d, "audiocpp_server.exe")
                if os.path.isfile(candidate):
                    exe = candidate
                    break
        return cls._find_gguf(), exe

    @classmethod
    def _backend(cls):
        backend = os.environ.get("VIDORA_S2_BACKEND")
        if backend:
            return backend
        try:
            import torch
            if torch.cuda.is_available():
                return "cuda"
        except Exception:
            pass
        print("[FishAudioS2] CUDA не найдена — переключаюсь на CPU backend")
        return "cpu"

    @classmethod
    def _get_server(cls):
        if cls._proc is not None and cls._proc.poll() is None:
            return cls._base_url
        gguf, exe = cls._paths()
        if not gguf or not os.path.isfile(gguf):
            raise RuntimeError(
                "Модель Fish Audio S2 Pro (.gguf) не найдена. Положи её в ~/ai-models или укажи VIDORA_S2_MODEL.")
        if os.name == "nt" and any(ord(c) > 127 for c in gguf):
            raise RuntimeError(
                f"Модель S2 лежит по кириллическому пути ({gguf}) — audio.cpp не открывает такие пути. Перенеси .gguf в ASCII-папку.")
        if not os.path.isfile(exe):
            raise RuntimeError(
                f"Движок audio.cpp не найден ({exe}). Скачай audiocpp-windows-cuda-runtime.zip и audiocpp-windows-cuda-balance.zip и распакуй в ai-models/audiocpp/.")
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        cfg = {
            "host": "127.0.0.1",
            "port": port,
            "backend": cls._backend(),
            "device": 0,
            "threads": 4,
            "lazy_load": True,
            "models": [{"id": cls.MODEL_ID, "family": "fish_audio", "path": gguf, "task": "tts", "mode": "offline"}],
        }
        cfg_path = os.path.join(tempfile.gettempdir(), "vidora_fish_s2_server.json")
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(cfg, f, ensure_ascii=False)
        cls._proc = subprocess.Popen([exe, "--config", cfg_path])
        cls._base_url = f"http://127.0.0.1:{port}"
        deadline = time.time() + 600
        while time.time() < deadline:
            if cls._proc.poll() is not None:
                cls._proc = None
                raise RuntimeError("[FishAudioS2] audiocpp_server упал при старте")
            try:
                if httpx.get(f"{cls._base_url}/health", timeout=3.0).status_code == 200:
                    return cls._base_url
            except httpx.HTTPError:
                pass
            time.sleep(1.0)
        raise RuntimeError("[FishAudioS2] audiocpp_server не поднялся за 10 минут")

    @classmethod
    def unload_model(cls):
        proc = cls._proc
        cls._proc = None
        cls._base_url = None
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                proc.wait(timeout=10)
            except Exception:
                proc.kill()

    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self._thread_pool, self._generate_sync, text, voice_model, kwargs)

    def _generate_sync(self, text, voice_model, kwargs):
        output_path = kwargs.get("output_path", "")
        text = to_s2_text(text, kwargs.get("design_prompt"))
        if not text:
            raise ValueError("Текст для озвучки пуст.")

        ref_audio = kwargs.get("ref_audio_path")
        if voice_model == "clone" and (not ref_audio or not os.path.exists(ref_audio)):
            raise ValueError("Для клонирования S2 нужен аудио-референс (ref_audio_path).")

        max_tokens = min(1024, max(200, int(len(text) * 2.0)))
        payload = {"model": self.MODEL_ID, "input": text, "response_format": "wav", "max_tokens": max_tokens}
        if voice_model == "clone":
            payload["voice_ref"] = self._prep_ref(ref_audio)
            if kwargs.get("ref_text"):
                payload["reference_text"] = self._trim_ref_text(kwargs["ref_text"])

        base = self._get_server()
        with httpx.Client(timeout=300.0) as client:
            res = client.post(f"{base}/v1/audio/speech", json=payload)
        if res.status_code != 200:
            raise RuntimeError(f"[FishAudioS2] сервер: HTTP {res.status_code} — {res.text[:200]}")
        if output_path:
            with open(output_path, "wb") as f:
                f.write(res.content)
