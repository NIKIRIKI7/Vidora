"""Адаптер CosyVoice3 с изолированным подпроцессом воркера."""

import asyncio
import concurrent.futures
import json
import os
import subprocess
from pathlib import Path
from typing import Optional

from app.core.config import settings
from app.core.process_supervisor import ProcessSupervisor
from app.domain.exceptions import ProviderExecutionError
from app.infrastructure.ai.tts.base import BaseTTSProvider
from app.utils.audio_utils import extract_instruct_tag, clean_voice_tags


def trim_ref_audio_for_clone(ref_audio_path: str, max_seconds: float = 10.0) -> str:
    """Обрезает аудио-референс для клонирования до ~10с по границе слова (Whisper),
    чтобы фразы не обрывались на полуслове. Кэширует результат в temp."""
    if not ref_audio_path or not os.path.exists(ref_audio_path):
        return ref_audio_path
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", ref_audio_path],
            capture_output=True, text=True,
        )
        dur = float(out.stdout.strip())
    except Exception:
        return ref_audio_path
    if dur <= max_seconds:
        return ref_audio_path

    import hashlib, tempfile
    key = hashlib.md5((ref_audio_path + str(os.path.getmtime(ref_audio_path))).encode("utf-8")).hexdigest()[:12]
    cache = os.path.join(tempfile.gettempdir(), f"cosy_ref_{key}.wav")
    if os.path.exists(cache):
        return cache

    cut_at = max_seconds
    try:
        import torch
        from faster_whisper import WhisperModel
        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        model = WhisperModel("Systran/faster-whisper-small", device=device, compute_type=compute_type,
                             download_root=str(settings.AI_MODELS_DIR))
        segments, _info = model.transcribe(ref_audio_path, word_timestamps=True, language="ru", vad_filter=True)
        words = [w for seg in segments for w in seg.words]
        for w in reversed(words):
            if w.end and 3.0 <= w.end <= max_seconds:
                cut_at = w.end
                break
        del model
        import gc
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception as e:
        print(f"[CosyVoice] trim: Whisper-таймкоды недоступны ({e}), режу на {max_seconds:.1f}s")

    try:
        subprocess.run(["ffmpeg", "-y", "-i", ref_audio_path, "-t", f"{cut_at:.2f}", "-ar", "16000", cache],
                       capture_output=True, check=False)
        if os.path.exists(cache):
            return cache
    except Exception:
        pass
    return ref_audio_path


class CosyVoiceProvider(BaseTTSProvider):
    """CosyVoice3 гоняется в отдельном venv (venv-cosyvoice) как subprocess-worker:
    его transformers==4.51.3 конфликтует с transformers>=5.3.0 основного venv."""
    _proc: Optional[subprocess.Popen] = None
    _thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    @classmethod
    def _paths(cls):
        base = settings.BASE_DIR
        weights = base / "ai-models" / "Fun-CosyVoice3-0.5B"
        worker = base / "app" / "infrastructure" / "workers" / "cosyvoice_worker.py"
        py = base / "venv-cosyvoice" / "Scripts" / "python.exe"
        if not py.exists():
            py = base / "venv-cosyvoice" / "bin" / "python"
        return weights, worker, py

    @classmethod
    def unload_model(cls) -> None:
        proc = cls._proc
        cls._proc = None
        if proc:
            ProcessSupervisor.stop_process(
                proc,
                shutdown_cmd='{"shutdown": true}\n',
                timeout=4.0,
            )

    @classmethod
    def _get_worker(cls) -> subprocess.Popen:
        if cls._proc is not None and cls._proc.poll() is None:
            return cls._proc

        weights, worker, py = cls._paths()
        if not py.is_file():
            raise ProviderExecutionError(f"Виртуальное окружение venv-cosyvoice не найдено: {py}")
        if not weights.is_dir():
            raise ProviderExecutionError(f"Веса Fun-CosyVoice3-0.5B не найдены: {weights}")

        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        cls._proc = subprocess.Popen(
            [str(py), str(worker)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=None,
            text=True,
            encoding="utf-8",
            bufsize=1,
            env=env,
        )
        ProcessSupervisor.register(
            cls._proc,
            name="CosyVoice_Worker",
            shutdown_cmd='{"shutdown": true}\n',
        )

        while True:
            line = cls._proc.stdout.readline().strip()
            if line == "READY":
                break
            if not line:
                ProcessSupervisor.stop_process(
                    cls._proc,
                    shutdown_cmd='{"shutdown": true}\n',
                    timeout=2.0,
                )
                cls._proc = None
                raise ProviderExecutionError("CosyVoice worker аварийно завершился при старте")

        return cls._proc

    async def generate_tts(
            self, text: str, voice_model: str, output_path: Path, **kwargs
    ) -> None:
        loop = asyncio.get_running_loop()
        ref_audio = kwargs.get("ref_audio_path")
        if voice_model == "clone" and ref_audio:
            ref_audio = await loop.run_in_executor(
                self._thread_pool, trim_ref_audio_for_clone, ref_audio
            )

        clean_text, inline_instruct = extract_instruct_tag(text)
        clean_text = clean_voice_tags(clean_text)
        instruct = inline_instruct or kwargs.get("design_prompt")
        speed = kwargs.get("speed", 1.0)

        if not clean_text:
            raise ValueError("Текст для озвучки пуст.")

        await loop.run_in_executor(
            self._thread_pool,
            self._generate_sync,
            clean_text,
            voice_model,
            ref_audio,
            instruct,
            speed,
            kwargs.get("guidance_scale", 3.0),
            kwargs.get("num_steps", 32),
            str(output_path),
        )

    def _generate_sync(
            self,
            text,
            voice_model,
            ref_audio_path,
            design_prompt,
            speed,
            guidance_scale,
            num_steps,
            output_path,
    ):
        if voice_model == "clone" and (not ref_audio_path or not os.path.exists(ref_audio_path)):
            raise ValueError("Для клонирования CosyVoice требуется аудио-референс.")

        job = {
            "text": text,
            "voice_model": voice_model,
            "design_prompt": design_prompt,
            "ref_audio_path": ref_audio_path,
            "speed": speed,
            "guidance_scale": guidance_scale,
            "num_steps": num_steps,
            "output_path": output_path,
        }

        proc = self._get_worker()
        proc.stdin.write(json.dumps(job, ensure_ascii=False) + "\n")
        proc.stdin.flush()

        line = proc.stdout.readline().strip()
        if not line:
            self._proc = None
            raise ProviderExecutionError("CosyVoice worker перестал отвечать")

        result = json.loads(line)
        if not result.get("ok"):
            raise ProviderExecutionError(f"CosyVoice worker error: {result.get('error')}")
