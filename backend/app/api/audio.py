import os
import shutil
import subprocess
import difflib
import re
import warnings
import asyncio
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.schemas import (
    AudioGenerationRequest, AudioProcessRequest, AudioSyncRequest,
    AudioConcatRequest, AdvancedSilenceRequest, TranscribeRequest,
    DuckingPreviewRequest,
)
from app.services.audio_service import AudioService, generate_ducking_preview
from app.services.audio_provider import OmniVoiceProvider, LocalLLMTTSProvider, TTSProviderFactory, clean_voice_tags

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
warnings.filterwarnings("ignore", message=".*torchcodec is not installed correctly.*")
warnings.filterwarnings("ignore", message=".*Audio is shorter than 30s.*")
warnings.filterwarnings("ignore", message=".*TensorFloat-32.*")

CACHE_DIR = str(Path.home() / ".cache" / "vidora-models")
WHISPER_MODEL_DIR = str(Path(__file__).resolve().parents[2] / "ai-models")
os.environ.setdefault("HF_HOME", CACHE_DIR)
os.environ.setdefault("XDG_CACHE_HOME", CACHE_DIR)
os.environ.setdefault("TORCH_HOME", CACHE_DIR)

router = APIRouter(prefix="/api/v1/audio", tags=["audio"])
audio_service = AudioService()

def _resolve_path(path: str, project_path: str = "") -> str:
    if not path:
        return ""
    norm_path = os.path.normpath(path)
    if os.path.isabs(norm_path):
        return norm_path
    base_dir = os.getcwd()
    if project_path:
        norm_proj = os.path.normpath(project_path)
        if norm_path == norm_proj or norm_path.startswith(norm_proj + os.sep) or norm_path.startswith(norm_proj + "/"):
            return os.path.normpath(os.path.join(base_dir, norm_path))
        base_dir = os.path.join(base_dir, norm_proj)
    return os.path.normpath(os.path.join(base_dir, norm_path))

def _run_ffmpeg_sync(cmd: list, desc: str = "ffmpeg") -> str:
    result = subprocess.run(cmd, capture_output=True, text=False)
    stdout = result.stdout.decode("utf-8", errors="replace") if result.stdout else ""
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace") if result.stderr else "unknown error"
        err = stderr.strip()[:500]
        raise RuntimeError(f"FFmpeg error ({desc}): {err}")
    return stdout

async def _run_ffmpeg_async(cmd: list, desc: str = "ffmpeg") -> str:
    return await asyncio.to_thread(_run_ffmpeg_sync, cmd, desc)

def _free_vram():
    import gc, torch
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

def _get_audio_duration_sync(path: str) -> float:
    if not os.path.exists(path):
        return 0.0
    try:
        import wave
        with wave.open(path, 'r') as wav:
            return wav.getnframes() / float(wav.getframerate())
    except Exception:
        pass
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", path],
            capture_output=True, text=True,
        )
        dur = out.stdout.strip()
        return float(dur) if dur else 0.0
    except Exception:
        return 0.0

def _normalize_words(text: str) -> list:
    clean = clean_voice_tags(text)
    return [w.lower() for w in re.findall(r'[\w\u0400-\u04FF]+', clean) if w.strip()]

def _make_fallback_response(fragments, reason: str = "", audio_dur: float = 0.0):
    results, cur_time = [], 0.0
    total_words = sum(max(1, len(_normalize_words(f.text))) for f in fragments)
    for idx, frag in enumerate(fragments):
        words_count = max(1, len(_normalize_words(frag.text)))
        if audio_dur > 0 and total_words > 0:
            dur = audio_dur * (words_count / total_words)
        else:
            dur = max(words_count * 0.4, 1.0)
        end_time = cur_time + dur
        if idx == len(fragments) - 1 and audio_dur > 0:
            end_time = max(end_time, audio_dur)
        results.append({
            "id": frag.id,
            "startTime": round(cur_time, 3),
            "endTime": round(end_time, 3),
        })
        cur_time = end_time
    return {
        "status": "ok",
        "fragments_timings": results,
        "fallback": True,
        "reason": reason
    }

def _align_fragments_globally(fragments, recognized_words, audio_dur: float):
    if not recognized_words:
        return _make_fallback_response(fragments, reason="Слова не распознаны в аудио", audio_dur=audio_dur)["fragments_timings"]

    frag_word_lists = [_normalize_words(f.text) for f in fragments]
    script_words = []
    frag_ranges = []
    for wlist in frag_word_lists:
        start_idx = len(script_words)
        script_words.extend(wlist)
        frag_ranges.append((start_idx, len(script_words)))

    if not script_words:
        return _make_fallback_response(fragments, reason="Пустой текст фрагментов", audio_dur=audio_dur)["fragments_timings"]

    reco_texts = []
    for w in recognized_words:
        nw = _normalize_words(w.get("word", ""))
        reco_texts.append(nw[0] if nw else w.get("word", "").lower().strip())

    sm = difflib.SequenceMatcher(None, script_words, reco_texts)
    matching_blocks = sm.get_matching_blocks()

    script_to_reco = {}
    for i_block, j_block, size in matching_blocks:
        for offset in range(size):
            script_to_reco[i_block + offset] = recognized_words[j_block + offset]

    raw_timings = []
    for k, (s_start, s_end) in enumerate(frag_ranges):
        matched = [script_to_reco[i] for i in range(s_start, s_end) if i in script_to_reco]
        st = matched[0]["start"] if matched else None
        et = matched[-1]["end"] if matched else None
        raw_timings.append({"id": fragments[k].id, "st": st, "et": et, "word_count": max(1, s_end - s_start)})

    n = len(raw_timings)
    for i in range(n):
        if raw_timings[i]["st"] is None:
            prev_t = 0.0
            for prev_i in range(i - 1, -1, -1):
                if raw_timings[prev_i]["et"] is not None:
                    prev_t = raw_timings[prev_i]["et"]
                    break

            next_t = audio_dur if audio_dur > 0 else (prev_t + sum(raw_timings[x]["word_count"] * 0.4 for x in range(i, n)))
            next_idx = n
            for next_i in range(i + 1, n):
                if raw_timings[next_i]["st"] is not None:
                    next_t = raw_timings[next_i]["st"]
                    next_idx = next_i
                    break

            missing_words = sum(raw_timings[x]["word_count"] for x in range(i, next_idx))
            avail_dur = max(0.5 * (next_idx - i), next_t - prev_t)
            curr_pos = prev_t
            for x in range(i, next_idx):
                frac = raw_timings[x]["word_count"] / float(max(1, missing_words))
                dur = avail_dur * frac
                raw_timings[x]["st"] = curr_pos
                raw_timings[x]["et"] = curr_pos + dur
                curr_pos += dur

    final_results = []
    cur_end = 0.0
    for idx, item in enumerate(raw_timings):
        st = max(cur_end, item["st"] if item["st"] is not None else cur_end)
        et = item["et"] if item["et"] is not None else (st + item["word_count"] * 0.4)
        if et <= st:
            et = st + max(0.5, item["word_count"] * 0.35)
        if idx == 0 and st < 0.4:
            st = 0.0
        if idx == n - 1 and audio_dur > 0:
            et = max(et, audio_dur)
        final_results.append({
            "id": item["id"],
            "startTime": round(st, 3),
            "endTime": round(et, 3),
        })
        cur_end = et

    return final_results

def _sync_silero_vad(audio_path: str, temp_out: str):
    import torch
    import torchaudio
    model, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad', model='silero_vad', trust_repo=True, force_reload=False)
    (get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = utils
    wav_16k = read_audio(audio_path, sampling_rate=16000)
    speech_timestamps = get_speech_timestamps(wav_16k, model, sampling_rate=16000)
    if not speech_timestamps:
        shutil.copy2(audio_path, temp_out)
    else:
        wav_orig, sr = torchaudio.load(audio_path)
        chunks = []
        for chunk in speech_timestamps:
            start_idx = max(0, int((chunk['start'] / 16000.0 - 0.1) * sr))
            end_idx = min(wav_orig.shape[1], int((chunk['end'] / 16000.0 + 0.1) * sr))
            chunks.append(wav_orig[:, start_idx:end_idx])
        if chunks:
            concatenated = torch.cat(chunks, dim=1)
            torchaudio.save(temp_out, concatenated, sr)
        else:
            shutil.copy2(audio_path, temp_out)

def _sync_transcribe(audio_path: str, whisper_model: str) -> str:
    import whisperx
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"
    model = whisperx.load_model(whisper_model, device=device, compute_type=compute_type, download_root=WHISPER_MODEL_DIR)
    try:
        audio = whisperx.load_audio(audio_path)
        result = model.transcribe(audio, batch_size=8, language="ru")
        text = " ".join([seg["text"].strip() for seg in result["segments"]]).strip()
        return text
    finally:
        del model
        _free_vram()

def _sync_advanced_silence(audio_path: str, req: AdvancedSilenceRequest) -> float:
    from pydub import AudioSegment
    from pydub.silence import detect_silence
    audio = AudioSegment.from_file(audio_path)
    silences = detect_silence(audio, min_silence_len=req.min_silence_ms, silence_thresh=req.threshold_db)
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
            chunks.append(audio[start:start + kept_silence])
        last_end = end

    if last_end < len(audio):
        chunks.append(audio[last_end:])

    result = chunks[0]
    for chunk in chunks[1:]:
        result += chunk
    result.export(audio_path, format="wav")
    return len(result) / 1000.0

def _sync_whisper_alignment(audio_path: str, whisper_model: str, fragments, audio_dur: float):
    import whisperx
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    compute_type = "float16" if device == "cuda" else "int8"

    model = whisperx.load_model(whisper_model, device=device, compute_type=compute_type, download_root=WHISPER_MODEL_DIR)
    try:
        audio = whisperx.load_audio(audio_path)
        result = model.transcribe(audio, batch_size=8, language="ru")
        lang = result.get("language", "ru")
        recognized_words = []

        try:
            model_a, metadata = whisperx.load_align_model(language_code=lang, device=device, model_dir=WHISPER_MODEL_DIR)
            aligned_res = whisperx.align(result["segments"], model_a, metadata, audio, device, return_char_alignments=False)
            for segment in aligned_res.get("segments", []):
                for w in segment.get("words", []):
                    if "start" in w and "end" in w:
                        recognized_words.append(w)
            del model_a
        except Exception:
            for segment in result.get("segments", []):
                for w in segment.get("words", []):
                    if "start" in w and "end" in w:
                        recognized_words.append(w)
                if not segment.get("words"):
                    seg_words = _normalize_words(segment.get("text", ""))
                    if seg_words:
                        w_dur = max(0.1, (segment["end"] - segment["start"])) / len(seg_words)
                        for wi, sw in enumerate(seg_words):
                            recognized_words.append({
                                "word": sw,
                                "start": segment["start"] + wi * w_dur,
                                "end": segment["start"] + (wi + 1) * w_dur
                            })
        return _align_fragments_globally(fragments, recognized_words, audio_dur)
    finally:
        del model
        _free_vram()

@router.post("/vram/unload")
async def unload_vram_endpoint():
    await asyncio.to_thread(OmniVoiceProvider.unload_model)
    await asyncio.to_thread(LocalLLMTTSProvider.unload_model)
    await asyncio.to_thread(TTSProviderFactory.unload_all)
    await asyncio.to_thread(_free_vram)
    return {"status": "ok", "detail": "VRAM полностью очищена"}

@router.post("/generate")
async def generate_audio(request: AudioGenerationRequest):
    if not request.project_path:
        request.project_path = "vidora_projects"
    os.makedirs(request.project_path, exist_ok=True)
    try:
        return await audio_service.generate(request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-ref")
async def upload_ref(project_path: str = Form(default="vidora_projects"), file: UploadFile = File(...)):
    refs_dir = os.path.join(project_path, "assets", "refs")
    os.makedirs(refs_dir, exist_ok=True)
    file_path = os.path.normpath(os.path.abspath(os.path.join(refs_dir, file.filename)))
    
    def _write():
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

    await asyncio.to_thread(_write)
    return {"status": "ok", "ref_audio_path": file_path}

@router.post("/process")
async def process_audio(request: AudioProcessRequest):
    audio_path = _resolve_path(request.audio_path, request.project_path)
    if not os.path.exists(audio_path):
        return {"status": "error", "detail": f"Файл не найден: {audio_path}"}
    
    backup_path = audio_path + ".bak"
    if not os.path.exists(backup_path):
        await asyncio.to_thread(shutil.copy2, audio_path, backup_path)

    temp_out = audio_path + ".tmp.wav"
    cmds = {
        "normalize": ["ffmpeg", "-y", "-i", audio_path, "-af", "loudnorm=I=-14:LRA=11:TP=-1.5", temp_out],
        "denoise": ["ffmpeg", "-y", "-i", audio_path, "-af", "highpass=f=80,agate=threshold=-40dB:ratio=10:attack=10:release=250,afftdn", temp_out],
        "enhance": ["ffmpeg", "-y", "-i", audio_path, "-af", "highpass=f=80,agate=threshold=-40dB:ratio=10:attack=10:release=250,acompressor,equalizer=f=3000:width_type=h:width=200:g=3", temp_out],
        "mastering": ["ffmpeg", "-y", "-i", audio_path, "-af", "highpass=f=80,agate=threshold=-40dB:ratio=10:attack=10:release=250,afftdn,acompressor=ratio=4:makeup=2,loudnorm=I=-14:LRA=11:TP=-1.5", temp_out],
    }

    if request.action in ["lavasr", "lavasr_enhance"]:
        try:
            from app.services.lavasr_enhancer import LavaSREnhancer
            await asyncio.to_thread(LavaSREnhancer.enhance_file, audio_path, audio_path, True, False)
            return {"status": "ok", "processed_audio_path": audio_path, "action_applied": "lavasr"}
        except Exception as e:
            return {"status": "error", "detail": f"LavaSR error: {e}"}
    elif request.action == "lavasr_denoise":
        try:
            from app.services.lavasr_enhancer import LavaSREnhancer
            await asyncio.to_thread(LavaSREnhancer.enhance_file, audio_path, audio_path, True, True)
            return {"status": "ok", "processed_audio_path": audio_path, "action_applied": "lavasr_denoise"}
        except Exception as e:
            return {"status": "error", "detail": f"LavaSR error: {e}"}
    elif request.action == "silero_vad":
        try:
            await asyncio.to_thread(_sync_silero_vad, audio_path, temp_out)
        except Exception as e:
            return {"status": "error", "detail": f"Silero VAD error: {str(e)}"}
    elif request.action in cmds:
        try:
            await _run_ffmpeg_async(cmds[request.action], desc=f"process/{request.action}")
        except RuntimeError as e:
            return {"status": "error", "detail": str(e)}
    else:
        return {"status": "error", "detail": "Неизвестное действие"}

    if not os.path.exists(temp_out):
        return {"status": "error", "detail": "Выходной файл не создан"}
    
    await asyncio.to_thread(shutil.move, temp_out, audio_path)
    return {"status": "ok", "processed_audio_path": audio_path, "action_applied": request.action}

@router.post("/undo")
async def undo_audio(request: AudioProcessRequest):
    audio_path = _resolve_path(request.audio_path, request.project_path)
    backup_path = audio_path + ".bak"
    if os.path.exists(backup_path):
        await asyncio.to_thread(shutil.copy2, backup_path, audio_path)
        return {"status": "ok", "processed_audio_path": audio_path, "detail": "Изменения отменены"}
    return {"status": "error", "detail": "Нет истории изменений для отката"}

@router.post("/transcribe")
async def transcribe_audio(req: TranscribeRequest):
    audio_path = _resolve_path(req.audio_path)
    if not os.path.exists(audio_path):
        return {"status": "error", "detail": "Файл не найден"}
    try:
        text = await asyncio.to_thread(_sync_transcribe, audio_path, req.whisper_model)
        return {"status": "ok", "text": text}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@router.post("/process/advanced-silence")
async def process_advanced_silence(req: AdvancedSilenceRequest):
    audio_path = _resolve_path(req.audio_path, req.project_path)
    if not os.path.exists(audio_path):
        return {"status": "error", "detail": "Файл не найден"}
    try:
        new_dur = await asyncio.to_thread(_sync_advanced_silence, audio_path, req)
        return {"status": "ok", "processed_audio_path": audio_path, "new_duration_sec": new_dur}
    except Exception as e:
        return {"status": "error", "detail": str(e)}

@router.post("/preview-ducking")
async def preview_ducking(req: DuckingPreviewRequest):
    voice_p = _resolve_path(req.voice_path, req.project_path)
    music_p = _resolve_path(req.music_path, req.project_path)
    if not os.path.exists(voice_p):
        raise HTTPException(status_code=404, detail=f"Аудиофайл голоса не найден: {req.voice_path}")
    if not os.path.exists(music_p):
        raise HTTPException(status_code=404, detail=f"Аудиофайл музыки не найден: {req.music_path}")
    
    req.voice_path = voice_p
    req.music_path = music_p
    try:
        out = await asyncio.to_thread(generate_ducking_preview, req)
        return {"status": "ok", "preview_url": out.replace("\\", "/")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/concat")
async def concat_audio(request: AudioConcatRequest):
    out_path = _resolve_path(request.output_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    list_file = out_path + ".list.txt"
    try:
        def _write_list():
            with open(list_file, "w", encoding="utf-8") as f:
                for p in request.audio_paths:
                    abs_p = _resolve_path(p)
                    if os.path.exists(abs_p):
                        f.write(f"file '{abs_p.replace(os.sep, '/')}'\n")

        await asyncio.to_thread(_write_list)

        try:
            await _run_ffmpeg_async(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", out_path],
                desc="concat",
            )
        except RuntimeError:
            await _run_ffmpeg_async(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, out_path],
                desc="concat (re-encode)",
            )
        return {"status": "ok", "output_path": out_path}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
    finally:
        if os.path.exists(list_file):
            os.remove(list_file)

@router.post("/sync")
async def sync_audio(request: AudioSyncRequest):
    audio_path = _resolve_path(request.audio_path, request.project_path)
    audio_dur = await asyncio.to_thread(_get_audio_duration_sync, audio_path)

    if not request.use_whisper:
        return _make_fallback_response(request.fragments, reason="Whisper отключен в настройках UI", audio_dur=audio_dur)

    if not os.path.exists(audio_path):
        return _make_fallback_response(request.fragments, reason="Файл аудио не найден", audio_dur=audio_dur)

    if request.auto_offload_vram:
        await asyncio.to_thread(OmniVoiceProvider.unload_model)
        await asyncio.to_thread(LocalLLMTTSProvider.unload_model)
        await asyncio.to_thread(TTSProviderFactory.unload_all)

    try:
        timings = await asyncio.to_thread(_sync_whisper_alignment, audio_path, request.whisper_model, request.fragments, audio_dur)
        return {"status": "ok", "fragments_timings": timings, "fallback": False}
    except Exception as e:
        await asyncio.to_thread(_free_vram)
        return _make_fallback_response(request.fragments, reason=str(e), audio_dur=audio_dur)
