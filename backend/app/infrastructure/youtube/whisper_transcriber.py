"""Конвейер ПОЛНОЙ транскрибации видео через Faster-Whisper (fallback при отсутствии субтитров).

Zero-Disk I/O: аудио стримится из yt-dlp через ffmpeg напрямую в RAM (numpy float32),
без записи .wav на диск. Длинное аудио режется по паузам речи (VAD Slicing) на 3 среза
и транскрибируется параллельно: beam_size=1 (Greedy) + vad_filter=True.
"""

import asyncio
import concurrent.futures
from typing import List, Optional

import numpy as np

from app.core.config import settings
from app.core.gpu import GPUManager
from app.infrastructure.youtube.circuit_cache import DeepTrendCircuitCache


def _pcm16_to_float32(raw: bytes) -> np.ndarray:
    """s16le PCM байты -> нормированный float32 массив для Whisper."""
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


class FasterWhisperRAMCache:
    """
    Изолированный кэш модели Faster-Whisper для транскрибации в RAM.
    Отдельно от WhisperModelCache (whisperx) в audio_tools — у них разные движки и задачи.
    """

    _model = None
    _model_name: Optional[str] = None
    _executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)

    @classmethod
    def get_model(cls, model_name: str = "small"):
        if cls._model is not None and cls._model_name == model_name:
            return cls._model

        cls.unload()
        from faster_whisper import WhisperModel
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        cls._model = WhisperModel(
            model_name,
            device=device,
            compute_type=compute_type,
            download_root=str(settings.AI_MODELS_DIR),
        )
        cls._model_name = model_name
        return cls._model

    @classmethod
    def unload(cls) -> None:
        if cls._model is not None:
            del cls._model
            cls._model = None
            cls._model_name = None
        GPUManager.clean_memory()


class WhisperTranscriber:
    """
    Zero-Disk RAM Streaming Whisper Engine.
    Стримит аудио напрямую в память (numpy float32), режет длинное аудио по паузам
    речи на параллельные срезы и транскрибирует их Faster-Whisper (beam_size=1 + VAD).
    """

    @classmethod
    async def extract_audio_to_ram(cls, target_url: str, timeout: float = 90.0) -> Optional[np.ndarray]:
        """Захват аудиодорожки в RAM: yt-dlp -> stdout -> ffmpeg -> pipe:1 (16kHz, mono, s16le)."""
        yt_proc = ff_proc = None
        try:
            # yt-dlp скачивает в stdout, ffmpeg читает из pipe:0 и отдаёт сырой PCM в pipe:1
            yt_proc = await asyncio.create_subprocess_exec(
                "yt-dlp", "--no-warnings", "-f", "ba/bestaudio/best", "-o", "-", target_url,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
            ff_proc = await asyncio.create_subprocess_exec(
                "ffmpeg", "-y", "-loglevel", "error", "-i", "pipe:0",
                "-vn", "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1",
                stdin=yt_proc.stdout, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
            raw_audio, _ = await asyncio.wait_for(ff_proc.communicate(), timeout=timeout)
            try:
                await asyncio.wait_for(yt_proc.wait(), timeout=5.0)
            except asyncio.TimeoutError:
                yt_proc.kill()
            if not raw_audio or len(raw_audio) < 32000:  # меньше 1 секунды звука
                return None
            return _pcm16_to_float32(raw_audio)
        except Exception:
            return None
        finally:
            for p in (ff_proc, yt_proc):
                if p is not None and p.returncode is None:
                    try:
                        p.kill()
                    except Exception:
                        pass

    @staticmethod
    def _split_audio_by_vad(audio: np.ndarray, sample_rate: int = 16000, target_chunks: int = 3) -> List[np.ndarray]:
        """
        Разбивает длинный аудиомассив в RAM на target_chunks срезов по точкам минимальной
        энергии (тишины). Аудио короче 90 секунд не режется (1 срез).
        """
        total_samples = len(audio)
        total_seconds = total_samples / sample_rate

        if total_seconds < 90.0 or target_chunks <= 1:
            return [audio]

        chunk_size = total_samples // target_chunks
        split_indices = []
        frame_len = sample_rate // 10  # 100ms фрейм энергии

        for i in range(1, target_chunks):
            approx_idx = i * chunk_size
            search_start = max(0, approx_idx - sample_rate * 10)
            search_end = min(total_samples, approx_idx + sample_rate * 10)
            window = audio[search_start:search_end]

            if len(window) > frame_len:
                usable = len(window) - (len(window) % frame_len)
                energies = np.sum(np.abs(window[:usable].reshape(-1, frame_len)), axis=1)
                best_split = search_start + int(np.argmin(energies)) * frame_len
            else:
                best_split = approx_idx
            split_indices.append(best_split)

        chunks = []
        last_idx = 0
        for s_idx in split_indices:
            chunks.append(audio[last_idx:s_idx])
            last_idx = s_idx
        chunks.append(audio[last_idx:])
        return chunks

    @classmethod
    async def transcribe_audio_full(
        cls,
        video_url_or_id: str,
        lang: str = "ru",
        whisper_model: str = "small",
    ) -> Optional[str]:
        cache_key = f"whisper_ram_full_{video_url_or_id}_{lang}"
        cached = DeepTrendCircuitCache.get_l3(cache_key)
        if cached is not None:
            return cached

        target_url = (
            video_url_or_id
            if video_url_or_id.startswith("http")
            else f"https://youtu.be/{video_url_or_id}"
        )

        audio_np = await cls.extract_audio_to_ram(target_url)
        if audio_np is None:
            return None

        target_lang = lang if lang in ("ru", "en", "es", "de", "fr") else "ru"
        audio_chunks = cls._split_audio_by_vad(audio_np, sample_rate=16000, target_chunks=3)
        model = FasterWhisperRAMCache.get_model(whisper_model)

        def _transcribe_chunk(chunk: np.ndarray) -> str:
            try:
                # Greedy (beam_size=1) + VAD -> ~3x быстрее полного beam search
                # ponytail: 3 среза параллельно через один WhisperModel (ctranslate2
                # потокобезопасен); на CUDA при OOM — GPUManager.run_exclusive.
                segments, _ = model.transcribe(
                    chunk,
                    beam_size=1,
                    vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 400},
                    language=target_lang,
                )
                return " ".join(seg.text.strip() for seg in segments if seg.text).strip()
            except Exception as e:
                print(f"[Faster-Whisper RAM Error] {e}")
                return ""

        loop = asyncio.get_running_loop()
        tasks = [
            loop.run_in_executor(FasterWhisperRAMCache._executor, _transcribe_chunk, ch)
            for ch in audio_chunks
        ]
        try:
            chunk_results = await asyncio.gather(*tasks, return_exceptions=True)
            transcript = " ".join(r for r in chunk_results if isinstance(r, str) and r).strip()
        finally:
            GPUManager.clean_memory()

        if transcript:
            DeepTrendCircuitCache.set_l3(cache_key, transcript)
            return transcript

        return None
