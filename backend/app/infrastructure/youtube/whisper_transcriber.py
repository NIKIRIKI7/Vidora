"""Конвейер транскрибации: Innertube Fast-Track + Faster-Whisper + полная транскрибация.

Каскад Subtitle Fast-Track:
  Tier 0: Innertube TimedText (< 100 мс, 0 GPU).
  Tier 1: Byte-Range Audio (0-1.5MB / ~90 сек) -> Faster-Whisper в RAM,
          с VAD-контролем плотности речи и сдвигом окна при невербальном интро.
  Tier 2: yt-dlp 90s fallback, если Innertube заблокирован.
Полная транскрибация (transcribe_audio_full) — только по требованию для draft-сценария.
"""

import asyncio
import concurrent.futures
import subprocess
from typing import List, Optional, Tuple

import numpy as np

from app.core.config import settings
from app.core.gpu import GPUManager
from app.infrastructure.youtube.circuit_cache import DeepTrendCircuitCache
from app.infrastructure.youtube.http_client import DeepTrendHTTPPool
from app.infrastructure.youtube.innertube import InnertubeClient
from app.infrastructure.youtube.normalizer import extract_video_id, normalize_language_code


def _pcm16_to_float32(raw: bytes) -> np.ndarray:
    if not raw:
        return np.array([], dtype=np.float32)
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


class FasterWhisperRAMCache:
    _model = None
    _model_name: Optional[str] = None
    _executor = concurrent.futures.ThreadPoolExecutor(max_workers=3)

    @classmethod
    def get_model(cls, model_name: str = "small"):
        if cls._model is not None and cls._model_name == model_name:
            return cls._model
        cls.unload()
        import torch
        from faster_whisper import WhisperModel

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
    @classmethod
    async def extract_audio_to_ram(
        cls, target_url: str, timeout: float = 90.0
    ) -> Optional[np.ndarray]:
        def _extract_sync() -> Optional[bytes]:
            yt_proc = ff_proc = None
            try:
                yt_proc = subprocess.Popen(
                    ["yt-dlp", "--no-warnings", "-f", "ba/bestaudio/best", "-o", "-", target_url],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                )
                ff_proc = subprocess.Popen(
                    ["ffmpeg", "-y", "-loglevel", "error", "-i", "pipe:0", "-vn", "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1"],
                    stdin=yt_proc.stdout,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                )
                raw_audio, _ = ff_proc.communicate(timeout=timeout)
                try:
                    yt_proc.wait(timeout=5.0)
                except Exception:
                    yt_proc.kill()
                return raw_audio
            except Exception:
                return None
            finally:
                for p in (ff_proc, yt_proc):
                    if p is not None and p.poll() is None:
                        try:
                            p.kill()
                        except Exception:
                            pass

        raw_audio = await asyncio.to_thread(_extract_sync)
        if not raw_audio or len(raw_audio) < 32000:
            return None
        return _pcm16_to_float32(raw_audio)

    @staticmethod
    def _split_audio_by_vad(
        audio: np.ndarray, sample_rate: int = 16000, target_chunks: int = 3
    ) -> List[np.ndarray]:
        total_samples = len(audio)
        total_seconds = total_samples / sample_rate
        if total_seconds < 90.0 or target_chunks <= 1:
            return [audio]
        chunk_size = total_samples // target_chunks
        split_indices = []
        frame_len = sample_rate // 10
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

    @staticmethod
    def _calculate_vad_speech_density(
        audio: np.ndarray, sample_rate: int = 16000, frame_ms: int = 30
    ) -> float:
        if len(audio) == 0:
            return 0.0
        frame_size = int(sample_rate * (frame_ms / 1000.0))
        num_frames = len(audio) // frame_size
        if num_frames == 0:
            return 0.0
        trimmed = audio[: num_frames * frame_size].reshape(-1, frame_size)
        energies = np.sqrt(np.mean(trimmed**2, axis=1))
        speech_frames = np.sum(energies > 0.012)
        return float(speech_frames / num_frames)

    @classmethod
    async def _fetch_byte_range_pcm(
        cls, stream_url: str, start_byte: int, end_byte: int, timeout: float = 6.0
    ) -> Optional[np.ndarray]:
        client = await DeepTrendHTTPPool.get_client()
        headers = {"Range": f"bytes={start_byte}-{end_byte}"}
        try:
            res = await client.get(stream_url, headers=headers, timeout=timeout)
            if res.status_code not in (200, 206) or len(res.content) < 32000:
                return None

            def _decode_sync(content: bytes) -> Optional[bytes]:
                try:
                    process = subprocess.Popen(
                        ["ffmpeg", "-y", "-err_detect", "ignore_err", "-f", "webm", "-i", "pipe:0", "-vn", "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1"],
                        stdin=subprocess.PIPE,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL,
                    )
                    stdout, _ = process.communicate(input=content, timeout=timeout)
                    return stdout
                except Exception:
                    return None

            stdout = await asyncio.to_thread(_decode_sync, res.content)
            return _pcm16_to_float32(stdout) if stdout else None
        except Exception:
            return None

    @classmethod
    async def transcribe_head_fast_track(
        cls,
        video_url_or_id: str,
        lang: str = "ru",
        whisper_model: str = "small",
    ) -> Tuple[str, str]:
        """
        Сверхбыстрое извлечение первых 90 секунд:
        1. Innertube TimedText (< 100 мс, 0 VRAM)
        2. Byte-Range 0-1.5MB Stream + VAD Shift
        3. yt-dlp 90s fallback
        """
        v_id = extract_video_id(video_url_or_id)
        if not v_id:
            return "", "none"

        lang_code, _, _ = normalize_language_code(lang)
        cache_key = f"transcript_fast_{v_id}_{lang_code}"
        cached = DeepTrendCircuitCache.get_l3(cache_key)
        if cached is not None:
            return cached.get("text", ""), cached.get("source", "cached")

        # 1. Tier-0 Innertube TimedText
        direct_sub = await InnertubeClient.extract_fast_subtitles(
            v_id, preferred_langs=[lang_code, "en"]
        )
        if direct_sub and len(direct_sub) > 60:
            DeepTrendCircuitCache.set_l3(
                cache_key, {"text": direct_sub, "source": "innertube_timedtext"}
            )
            return direct_sub, "innertube_timedtext"

        # 2. Tier-1 Byte-Range Audio Window
        audio_pcm: Optional[np.ndarray] = None
        stream_url = await InnertubeClient.extract_streaming_audio_url(v_id)
        if stream_url:
            audio_pcm = await cls._fetch_byte_range_pcm(
                stream_url, start_byte=0, end_byte=1572864
            )
            if audio_pcm is not None and len(audio_pcm) > 0:
                density = cls._calculate_vad_speech_density(audio_pcm)
                if density < 0.28:
                    shifted_pcm = await cls._fetch_byte_range_pcm(
                        stream_url, start_byte=1572864, end_byte=4718592
                    )
                    if shifted_pcm is not None and len(shifted_pcm) > 0:
                        audio_pcm = shifted_pcm

        # 3. Tier-2 yt-dlp Fallback
        source_label = "whisper_head_90s"
        if audio_pcm is None or len(audio_pcm) < 32000:
            target_url = f"https://youtu.be/{v_id}"
            audio_pcm = await cls.extract_audio_to_ram(target_url, timeout=30.0)
            if audio_pcm is not None and len(audio_pcm) > 16000 * 90:
                audio_pcm = audio_pcm[: 16000 * 90]
            source_label = "ytdlp_whisper_fallback"

        if audio_pcm is None or len(audio_pcm) < 16000:
            return "", "none"

        model = FasterWhisperRAMCache.get_model(whisper_model)
        target_lang = lang_code if lang_code in ("ru", "en", "es", "de", "fr") else "ru"

        def _sync_whisper():
            try:
                segments, _ = model.transcribe(
                    audio_pcm,
                    beam_size=1,
                    vad_filter=True,
                    vad_parameters={"min_silence_duration_ms": 350},
                    language=target_lang,
                )
                return " ".join(s.text.strip() for s in segments if s.text).strip()
            except Exception:
                return ""

        loop = asyncio.get_running_loop()
        transcript = await loop.run_in_executor(
            FasterWhisperRAMCache._executor, _sync_whisper
        )

        if transcript:
            DeepTrendCircuitCache.set_l3(
                cache_key, {"text": transcript, "source": source_label}
            )
            return transcript, source_label

        return "", "none"

    @classmethod
    async def transcribe_audio_full(
        cls,
        video_url_or_id: str,
        lang: str = "ru",
        whisper_model: str = "small",
    ) -> Optional[str]:
        """Полная транскрипция для финального сценария (используется metadata_downloader)."""
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
