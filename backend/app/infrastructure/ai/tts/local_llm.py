import asyncio
import concurrent.futures
import json
import os
import subprocess
import sys
from pathlib import Path

from app.core.config import settings
from app.core.process_supervisor import ProcessSupervisor
from app.infrastructure.ai.tts.base import BaseTTSProvider
from app.utils.audio_utils import clean_voice_tags

_BACKEND_DIR = settings.BASE_DIR
_TTS_WORKER = _BACKEND_DIR / "app" / "infrastructure" / "workers" / "tts_worker.py"
_QWEN_PYTHON = _BACKEND_DIR / ".venv-qwen" / "Scripts" / "python.exe"
_MOSS_PYTHON = _BACKEND_DIR / ".venv-moss" / "Scripts" / "python.exe"

_LOCAL_TTS_ENGINES = {
    "qwen-tts/voice-design": {"engine": "qwen", "python": _QWEN_PYTHON, "model": "ai-models/Qwen3-TTS-VoiceDesign",
                              "mode": "design"},
    "qwen-tts/clone": {"engine": "qwen", "python": _QWEN_PYTHON, "model": "ai-models/Qwen3-TTS-Base", "mode": "clone"},
    "qwen-tts/custom-voice": {"engine": "qwen", "python": _QWEN_PYTHON, "model": "ai-models/Qwen3-TTS-CustomVoice",
                              "mode": "custom"},
    "moss-tts/local": {"engine": "moss", "python": _MOSS_PYTHON, "model": "ai-models/MOSS-TTS-Local-Transformer",
                       "mode": "moss", "codec": "ai-models/MOSS-Audio-Tokenizer"},
}
_QWEN_SPEAKERS = {
    "aria": "Vivian", "nova": "Serena", "marcus": "Uncle_Fu",
    "kolya": "Ryan", "kseniya": "Vivian", "alloy": "Ryan",
}
_SPEAKERS_DIR = str(_BACKEND_DIR / "ai-models" / "speakers")


def resolve_clone_reference(voice_model: str, ref_audio_path, ref_text):
    """Возвращает (ref_audio, ref_text). Базовые голоса падают на WAV-референс из ai-models/speakers/."""
    if ref_audio_path:
        return ref_audio_path, ref_text
    speaker_wav = os.path.join(_SPEAKERS_DIR, f"{voice_model}.wav")
    if os.path.exists(speaker_wav):
        return speaker_wav, ref_text
    raise ValueError(
        f"Для voice-clone нужен ref_audio_path, либо положите {voice_model}.wav в {_SPEAKERS_DIR}"
    )


class LocalLLMTTSProvider(BaseTTSProvider):
    _procs = {}
    _thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    def __init__(self, engine: str, python: Path, model: str, mode: str, codec: str = None):
        self.engine = engine
        self.python = python
        self.model = model
        self.mode = mode
        self.codec = codec

    @classmethod
    def unload_model(cls):
        for key, proc in list(cls._procs.items()):
            if proc:
                ProcessSupervisor.stop_process(
                    proc,
                    shutdown_cmd='{"shutdown": true}\n',
                    timeout=3.0,
                )
        cls._procs.clear()

    def _get_worker_proc(self):
        key = f"{self.engine}_{self.python}"
        proc = self._procs.get(key)
        if proc is not None and proc.poll() is None:
            return proc
        env = dict(os.environ)
        env["PYTHONIOENCODING"] = "utf-8"
        new_proc = subprocess.Popen(
            [str(self.python), str(_TTS_WORKER)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=sys.stderr,
            text=True, encoding="utf-8", bufsize=1, env=env,
        )
        line = new_proc.stdout.readline().strip()
        if line != "READY":
            ProcessSupervisor.stop_process(new_proc, timeout=1.0)
            raise RuntimeError(f"[{self.engine}] Worker failed to start: {line}")

        ProcessSupervisor.register(
            new_proc,
            name=f"LocalLLM_TTS_{self.engine}",
            shutdown_cmd='{"shutdown": true}\n',
        )
        self._procs[key] = new_proc
        return new_proc

    def _generate_sync(self, text: str, voice_model: str, kwargs: dict):
        text = clean_voice_tags(text).strip()
        output_path = kwargs.get("output_path", "")
        job = {
            "engine": self.engine,
            "model_id": str(_BACKEND_DIR / self.model),
            "mode": self.mode,
            "text": text,
            "voice_model": voice_model,
            "language": kwargs.get("language", "Russian"),
            "output": output_path,
        }
        if self.mode == "design":
            instruct = kwargs.get("design_prompt") or kwargs.get("instruct")
            if not instruct:
                raise ValueError("Для voice-design нужен design_prompt")
            job["design_prompt"] = instruct
        elif self.mode == "clone":
            ref_audio, ref_text = resolve_clone_reference(voice_model, kwargs.get("ref_audio_path"),
                                                          kwargs.get("ref_text"))
            job["ref_audio"] = ref_audio
            job["ref_text"] = ref_text or ""
        elif self.mode == "custom":
            job["speaker"] = _QWEN_SPEAKERS.get(voice_model, "Vivian")
        elif self.mode == "moss":
            job["codec_path"] = str(_BACKEND_DIR / self.codec)
            job["device"] = "cpu"

        proc = self._get_worker_proc()
        proc.stdin.write(json.dumps(job, ensure_ascii=False) + "\n")
        proc.stdin.flush()
        res_line = proc.stdout.readline().strip()
        if not res_line:
            self.unload_model()
            raise RuntimeError(f"[{self.engine}] Worker упал во время генерации")
        res = json.loads(res_line)
        if "error" in res:
            raise RuntimeError(f"[{self.engine}] Ошибка генерации: {res['error']}")

    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(self._thread_pool, self._generate_sync, text, voice_model, kwargs)
