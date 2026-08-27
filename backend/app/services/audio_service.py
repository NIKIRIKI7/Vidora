"""Сервис синтеза речи, выравнивания таймингов (WhisperX) и постобработки аудио."""

import asyncio
import os
import shutil
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pydub
from pydub.silence import detect_silence

from app.core.config import settings
from app.core.gpu import GPUManager
from app.core.logging import add_log
from app.core.ws import ws_manager
from app.domain.exceptions import ResourceNotFoundError, VidoraException
from app.domain.schemas.audio import (
    AudioGenerationRequest,
    AudioSyncRequest,
    AudioProcessRequest,
    AdvancedSilenceRequest,
    BatchAudioGenerationRequest,
    DuckingPreviewRequest,
    SyncFragment,
)
from app.infrastructure.ai.audio_tools.alignment import (
    WhisperModelCache,
    align_fragments_globally,
    make_fallback_response,
)
from app.infrastructure.ai.audio_tools.enhancer import LavaSREnhancer
from app.infrastructure.ai.tts.factory import TTSProviderFactory
from app.infrastructure.media.ducking import mix_voice_and_music_ducking
from app.infrastructure.media.ffmpeg import AsyncFFmpegRunner
from app.infrastructure.storage.path_resolver import PathResolver
from app.utils.audio_utils import (
    get_audio_duration_sync,
    extract_file_number,
    map_scene_audio_files,
)


class AudioService:
    PROCESS_ACTIONS = {
        "normalize": ["ffmpeg", "-y", "-i", "{src}", "-af", "loudnorm=I=-14:LRA=11:TP=-1.5", "{dst}"],
        "denoise": [
            "ffmpeg", "-y", "-i", "{src}",
            "-af", "highpass=f=80,agate=threshold=-40dB:ratio=10:attack=10:release=250,afftdn", "{dst}"
        ],
        "enhance": [
            "ffmpeg", "-y", "-i", "{src}",
            "-af",
            "highpass=f=80,agate=threshold=-40dB:ratio=10:attack=10:release=250,acompressor,equalizer=f=3000:width_type=h:width=200:g=3",
            "{dst}"
        ],
        "mastering": [
            "ffmpeg", "-y", "-i", "{src}",
            "-af",
            "highpass=f=80,agate=threshold=-40dB:ratio=10:attack=10:release=250,afftdn,acompressor=ratio=4:makeup=2,loudnorm=I=-14:LRA=11:TP=-1.5",
            "{dst}"
        ],
    }

    def __init__(self, tts_factory: Optional[TTSProviderFactory] = None):
        self.tts_factory = tts_factory or TTSProviderFactory

    def prepare_voice_output_path(
            self, project_path: str, file_prefix: str, fragment_id: str
    ) -> Path:
        raw_path = project_path or "vidora_projects"
        proj_path = PathResolver.resolve(raw_path) or (settings.BASE_DIR / raw_path).resolve()
        voice_dir = proj_path / "assets" / "voice"
        voice_dir.mkdir(parents=True, exist_ok=True)
        safe_prefix = PathResolver.sanitize_filename(file_prefix or "audio")
        return (voice_dir / f"{safe_prefix}_{fragment_id[:6]}.wav").resolve()

    async def generate_tts(self, request: AudioGenerationRequest) -> Dict[str, Any]:
        frag_short = request.fragment_id[:8]
        add_log(
            "INFO",
            "AUDIO_GEN",
            f"Старт генерации аудио [{frag_short}] (Engine: {request.engine or 'default'})",
            details=f"Текст: {request.text[:120]}...",
        )
        await ws_manager.broadcast({
            "type": "AUDIO_GEN_PROGRESS",
            "payload": {"fragment_id": request.fragment_id, "status": "processing", "percent": 15},
        })

        try:
            output_path = self.prepare_voice_output_path(
                request.project_path,
                request.file_prefix or "audio",
                request.fragment_id,
            )

            provider = self.tts_factory.get_provider(request.engine)
            api_keys_dict = request.api_keys.model_dump() if request.api_keys else {}

            async with GPUManager.run_exclusive():
                await provider.generate_tts(
                    text=request.text,
                    voice_model=request.voice_model,
                    output_path=output_path,
                    guidance_scale=request.guidance_scale,
                    num_steps=request.num_steps,
                    speed=request.speed,
                    duration=request.duration,
                    denoise=request.denoise,
                    preprocess_prompt=request.preprocess_prompt,
                    postprocess_output=request.postprocess_output,
                    ref_audio_path=request.ref_audio_path,
                    ref_text=request.ref_text,
                    design_prompt=request.design_prompt,
                    api_keys=api_keys_dict,
                )

            if request.postprocess_output:
                await asyncio.to_thread(
                    LavaSREnhancer.enhance_file,
                    str(output_path),
                    str(output_path),
                    True,
                    bool(request.denoise),
                )

            dur = await asyncio.to_thread(get_audio_duration_sync, str(output_path))
            add_log("SUCCESS", "AUDIO_GEN", f"Аудио готово [{frag_short}]: {output_path.name} ({dur:.2f}s)")
            await ws_manager.broadcast({
                "type": "AUDIO_GEN_PROGRESS",
                "payload": {"fragment_id": request.fragment_id, "status": "done", "percent": 100},
            })

            return {
                "status": "ok",
                "audio_url": output_path.name,
                "absolute_path": str(output_path),
                "duration": round(dur, 3),
            }
        except Exception as exc:
            err_trace = traceback.format_exc()
            add_log("ERROR", "AUDIO_GEN", f"Ошибка генерации [{frag_short}]: {str(exc)}", details=err_trace)
            await ws_manager.broadcast({
                "type": "AUDIO_GEN_PROGRESS",
                "payload": {"fragment_id": request.fragment_id, "status": "error", "error": str(exc)},
            })
            raise

    async def sync_alignment(self, request: AudioSyncRequest) -> Dict[str, Any]:
        add_log("INFO", "AUDIO_SYNC", f"Синхронизация сцены {request.scene_id}")
        audio_path = PathResolver.resolve(request.audio_path, request.project_path, must_exist=True)

        if not audio_path or not audio_path.exists():
            add_log("WARN", "AUDIO_SYNC", "Аудиофайл не найден, применен fallback расчет")
            return {
                "status": "ok",
                "fragments_timings": make_fallback_response(request.fragments, 0.0),
                "fallback": True,
            }

        audio_dur = await asyncio.to_thread(get_audio_duration_sync, str(audio_path))
        if not request.use_whisper:
            return {
                "status": "ok",
                "fragments_timings": make_fallback_response(request.fragments, audio_dur),
                "fallback": True,
            }

        if request.auto_offload_vram:
            self.tts_factory.unload_all()

        try:
            def _align_sync():
                import whisperx
                model = WhisperModelCache.get_model(request.whisper_model)
                audio_arr = whisperx.load_audio(str(audio_path))
                res = model.transcribe(audio_arr, batch_size=8, language="ru")
                reco = [
                    w for seg in res.get("segments", [])
                    for w in seg.get("words", [])
                    if "start" in w and "end" in w
                ]
                WhisperModelCache.touch()
                return align_fragments_globally(request.fragments, reco, audio_dur)

            timings = await asyncio.to_thread(_align_sync)
            add_log("SUCCESS", "AUDIO_SYNC", f"Тайминги выровнены для {request.scene_id}")
            return {"status": "ok", "fragments_timings": timings, "fallback": False}
        except Exception as e:
            WhisperModelCache.unload()
            GPUManager.clean_memory()
            add_log("ERROR", "AUDIO_SYNC", f"Сбой Whisper: {e}, применен fallback")
            return {
                "status": "ok",
                "fragments_timings": make_fallback_response(request.fragments, audio_dur),
                "fallback": True,
            }

    async def preview_ducking(self, req: DuckingPreviewRequest) -> str:
        voice_p = PathResolver.resolve(req.voice_path, req.project_path, must_exist=True)
        music_p = PathResolver.resolve(req.music_path, req.project_path, must_exist=True)

        if not voice_p or not voice_p.exists():
            raise ResourceNotFoundError(f"Голосовой файл не найден: {req.voice_path}")
        if not music_p or not music_p.exists():
            raise ResourceNotFoundError(f"Файл фоновой музыки не найден: {req.music_path}")

        proj_path = PathResolver.resolve(req.project_path) or (settings.BASE_DIR / req.project_path)
        out_target = proj_path / "assets" / "voice" / "preview_ducking.wav"

        out_path = await mix_voice_and_music_ducking(
            voice_path=voice_p,
            music_path=music_p,
            output_path=out_target,
            settings=req,
            total_duration=req.preview_duration,
        )
        return str(out_path)

    async def process_audio_filter(self, request: AudioProcessRequest) -> Dict[str, Any]:
        audio_path = PathResolver.resolve(request.audio_path, request.project_path, must_exist=True)
        if not audio_path or not audio_path.exists():
            raise ResourceNotFoundError(f"Аудиофайл не найден: {request.audio_path}")

        audio_str = str(audio_path)
        backup_path = audio_str + ".bak"
        if not os.path.exists(backup_path):
            await asyncio.to_thread(shutil.copy2, audio_str, backup_path)

        temp_out = audio_str + ".tmp.wav"
        if request.action in ("lavasr", "lavasr_enhance"):
            await asyncio.to_thread(LavaSREnhancer.enhance_file, audio_str, audio_str, True, False)
            return {"status": "ok", "processed_audio_path": audio_str, "action_applied": "lavasr"}

        if request.action == "lavasr_denoise":
            await asyncio.to_thread(LavaSREnhancer.enhance_file, audio_str, audio_str, True, True)
            return {"status": "ok", "processed_audio_path": audio_str, "action_applied": "lavasr_denoise"}

        if request.action == "silero_vad":
            def _vad_sync():
                import torch
                import torchaudio
                model, utils = torch.hub.load(
                    repo_or_dir="snakers4/silero-vad", model="silero_vad", trust_repo=True, force_reload=False
                )
                get_speech_timestamps, read_audio, *_ = utils
                wav_16k = read_audio(audio_str, sampling_rate=16000)
                speech_timestamps = get_speech_timestamps(wav_16k, model, sampling_rate=16000)
                if not speech_timestamps:
                    shutil.copy2(audio_str, temp_out)
                    return
                wav_orig, sr = torchaudio.load(audio_str)
                chunks = []
                for chunk in speech_timestamps:
                    start_idx = max(0, int((chunk["start"] / 16000.0 - 0.1) * sr))
                    end_idx = min(wav_orig.shape[1], int((chunk["end"] / 16000.0 + 0.1) * sr))
                    chunks.append(wav_orig[:, start_idx:end_idx])
                if chunks:
                    torchaudio.save(temp_out, torch.cat(chunks, dim=1), sr)
                else:
                    shutil.copy2(audio_str, temp_out)

            await asyncio.to_thread(_vad_sync)
        elif request.action in self.PROCESS_ACTIONS:
            tmpl = self.PROCESS_ACTIONS[request.action]
            cmd = [str(p).replace("{src}", audio_str).replace("{dst}", temp_out) for p in tmpl]
            await AsyncFFmpegRunner.run(cmd, desc=f"audio/{request.action}")
        else:
            raise VidoraException(f"Неизвестное действие обработки звука: {request.action}")

        if os.path.exists(temp_out):
            await asyncio.to_thread(shutil.move, temp_out, audio_str)

        return {"status": "ok", "processed_audio_path": audio_str, "action_applied": request.action}

    async def undo_audio_filter(self, request: AudioProcessRequest) -> Dict[str, Any]:
        audio_path = PathResolver.resolve(request.audio_path, request.project_path, must_exist=True)
        if not audio_path or not audio_path.exists():
            raise ResourceNotFoundError("Файл не найден")

        backup_path = str(audio_path) + ".bak"
        if os.path.exists(backup_path):
            await asyncio.to_thread(shutil.copy2, backup_path, str(audio_path))
            return {"status": "ok", "processed_audio_path": str(audio_path), "detail": "Изменения отменены"}

        raise ResourceNotFoundError("Нет истории изменений (.bak) для отката")

    async def process_advanced_silence(self, req: AdvancedSilenceRequest) -> float:
        audio_path = PathResolver.resolve(req.audio_path, req.project_path, must_exist=True)
        if not audio_path or not audio_path.exists():
            raise ResourceNotFoundError("Файл не найден")

        def _trim_silence_sync() -> float:
            audio = pydub.AudioSegment.from_file(str(audio_path))
            silences = detect_silence(
                audio, min_silence_len=req.min_silence_ms, silence_thresh=req.threshold_db
            )
            if not silences:
                return len(audio) / 1000.0

            chunks, last_end = [], 0
            for i, (start, end) in enumerate(silences):
                if start > last_end:
                    chunks.append(audio[last_end:start])
                silence_dur = end - start
                is_edge = (i == 0 and start == 0) or (i == len(silences) - 1 and end == len(audio))
                if is_edge and req.remove_edges:
                    pass
                elif req.max_silence_ms > 0:
                    kept_silence = min(silence_dur, req.max_silence_ms)
                    chunks.append(audio[start: start + kept_silence])
                last_end = end

            if last_end < len(audio):
                chunks.append(audio[last_end:])

            result = chunks[0]
            for chunk in chunks[1:]:
                result += chunk
            result.export(str(audio_path), format="wav")
            return len(result) / 1000.0

        return await asyncio.to_thread(_trim_silence_sync)

    async def transcribe_audio(self, audio_path_str: str, whisper_model: str = "small") -> str:
        resolved = PathResolver.resolve(audio_path_str, must_exist=True)
        if not resolved or not resolved.exists():
            raise ResourceNotFoundError(f"Файл не найден: {audio_path_str}")

        def _transcribe():
            import whisperx
            model = WhisperModelCache.get_model(whisper_model)
            audio = whisperx.load_audio(str(resolved))
            res = model.transcribe(audio, batch_size=8, language="ru")
            WhisperModelCache.touch()
            return " ".join([seg["text"].strip() for seg in res.get("segments", [])]).strip()

        return await asyncio.to_thread(_transcribe)

    async def concat_audios(self, audio_paths: List[str], output_path: str) -> str:
        out_p = Path(output_path)
        out_p.parent.mkdir(parents=True, exist_ok=True)
        list_file = out_p.with_suffix(".list.txt")

        try:
            with open(list_file, "w", encoding="utf-8") as f:
                for p in audio_paths:
                    if os.path.exists(p):
                        clean = str(Path(p).resolve()).replace(os.sep, "/")
                        f.write(f"file '{clean}'\n")

            try:
                await AsyncFFmpegRunner.run(
                    ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), "-c", "copy", str(out_p)],
                    desc="concat/copy",
                )
            except Exception:
                await AsyncFFmpegRunner.run(
                    ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", str(list_file), str(out_p)],
                    desc="concat/re-encode",
                )
            return str(out_p)
        finally:
            if list_file.exists():
                list_file.unlink(missing_ok=True)

    async def batch_assign_scene_audios(
        self,
        project_path: str,
        scene_ids: List[str],
        uploaded_files: List[Tuple[str, bytes]],
    ) -> Dict[str, Any]:
        """Маппит пачку готовых аудиофайлов на сцены по номерам в имени (voice_01 -> сцена 1)
        или, если номеров нет, 1 к 1 в естественном порядке."""
        raw_path = project_path or "vidora_projects"
        proj_path = PathResolver.resolve(raw_path) or (settings.BASE_DIR / raw_path).resolve()
        voice_dir = proj_path / "assets" / "voice"
        voice_dir.mkdir(parents=True, exist_ok=True)

        saved = []
        for filename, content in uploaded_files:
            safe_name = PathResolver.sanitize_filename(filename or "voice.wav")
            dest = voice_dir / safe_name
            await asyncio.to_thread(dest.write_bytes, content)
            dur = await asyncio.to_thread(get_audio_duration_sync, str(dest))
            saved.append({
                "filename": safe_name,
                "path": str(dest),
                "duration": round(dur, 3),
                "number": extract_file_number(safe_name),
            })

        matches, unmatched = map_scene_audio_files(scene_ids, saved)
        matched = [
            {
                "scene_id": m["scene_id"],
                "filename": m["filename"],
                "relative_path": f"assets/voice/{m['filename']}",
                "absolute_path": str(voice_dir / m["filename"]),
                "duration": next(x["duration"] for x in saved if x["filename"] == m["filename"]),
            }
            for m in matches
        ]

        add_log("INFO", "AUDIO_BATCH", f"Пакетно привязано {len(matched)} аудио к сценам проекта '{raw_path}'")
        return {
            "status": "ok",
            "matched_count": len(matched),
            "matches": matched,
            "unmatched_files": unmatched,
        }

    async def batch_generate_project_audio(
        self, request: BatchAudioGenerationRequest
    ) -> Dict[str, Any]:
        """Пакетная озвучка всех сцен: генерирует аудио, замеряет длительность,
        выравнивает тайминги фрагментов (Whisper) и шлёт прогресс по WebSocket."""
        total = len(request.scenes)
        if total == 0:
            return {"status": "ok", "total": 0, "completed": 0, "failed": 0, "results": []}

        add_log("INFO", "AUDIO_BATCH_GEN",
                f"Старт пакетной озвучки: {total} сцен (Engine: {request.engine or 'default'}, Голос: {request.voice_model})")

        results: List[Dict[str, Any]] = []
        completed, failed = 0, 0

        for idx, scene in enumerate(request.scenes):
            await ws_manager.broadcast({
                "type": "BATCH_AUDIO_PROGRESS",
                "payload": {
                    "current": idx + 1, "total": total,
                    "percent": int(idx / total * 100),
                    "scene_id": scene.scene_id, "status": "processing",
                },
            })

            scene_text = (scene.text or "").strip()
            if not scene_text and scene.fragments:
                scene_text = " ".join(f.text.strip() for f in scene.fragments if f.text.strip())

            if not scene_text:
                failed += 1
                results.append({"scene_id": scene.scene_id, "filename": "", "relative_path": "",
                                "absolute_path": "", "duration": 0.0, "status": "error",
                                "error": "Текст сцены пуст"})
                continue

            try:
                gen_res = await self.generate_tts(AudioGenerationRequest(
                    fragment_id=scene.scene_id,
                    text=scene_text,
                    file_prefix=f"{request.file_prefix or 'scene'}_{idx + 1:02d}",
                    voice_model=request.voice_model,
                    guidance_scale=request.guidance_scale,
                    num_steps=request.num_steps,
                    speed=request.speed,
                    denoise=request.denoise,
                    postprocess_output=request.postprocess_output,
                    ref_audio_path=request.ref_audio_path,
                    ref_text=request.ref_text,
                    design_prompt=request.design_prompt,
                    project_path=request.project_path,
                    engine=request.engine,
                    api_keys=request.api_keys,
                ))
                audio_path = gen_res["absolute_path"]
                duration = gen_res["duration"]

                fragments_timings = None
                if request.auto_align and scene.fragments:
                    sync_res = await self.sync_alignment(AudioSyncRequest(
                        scene_id=scene.scene_id,
                        audio_path=audio_path,
                        fragments=[SyncFragment(id=f.id, text=f.text) for f in scene.fragments],
                        project_path=request.project_path,
                        use_whisper=True,
                        auto_offload_vram=False,
                        whisper_model=request.whisper_model,
                    ))
                    fragments_timings = sync_res.get("fragments_timings")

                completed += 1
                results.append({
                    "scene_id": scene.scene_id,
                    "filename": Path(audio_path).name,
                    "relative_path": f"assets/voice/{Path(audio_path).name}",
                    "absolute_path": audio_path,
                    "duration": duration,
                    "status": "ok",
                    "fragments_timings": fragments_timings,
                })
            except Exception as exc:
                failed += 1
                add_log("ERROR", "AUDIO_BATCH_GEN", f"Ошибка озвучки сцены {scene.scene_id}: {exc}")
                results.append({"scene_id": scene.scene_id, "filename": "", "relative_path": "",
                                "absolute_path": "", "duration": 0.0, "status": "error", "error": str(exc)})

        self.tts_factory.unload_all()
        GPUManager.clean_memory()

        await ws_manager.broadcast({
            "type": "BATCH_AUDIO_PROGRESS",
            "payload": {"current": total, "total": total, "percent": 100, "status": "done"},
        })

        return {"status": "ok", "total": total, "completed": completed, "failed": failed, "results": results}
