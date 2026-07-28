import os
import shutil
import subprocess
import difflib
import warnings
from pathlib import Path

os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
warnings.filterwarnings("ignore", message=".*torchcodec is not installed correctly.*")
warnings.filterwarnings("ignore", message=".*Audio is shorter than 30s.*")
warnings.filterwarnings("ignore", message=".*TensorFloat-32.*")

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.schemas import AudioGenerationRequest, AudioProcessRequest, AudioSyncRequest, AudioConcatRequest, AdvancedSilenceRequest
from app.services.audio_service import AudioService
from app.services.audio_provider import OmniVoiceProvider

# ponytail: avoid Cyrillic in cache path — torch.jit.load uses fopen() which
# garbles non-ASCII on Windows. Keep models under ~/.cache (always ASCII).
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

def _run_ffmpeg(cmd: list, desc: str = "ffmpeg") -> str:
    print(f"[AUDIO API] {desc}: {' '.join(cmd)}")
    result = subprocess.run(cmd, capture_output=True, text=False)
    stdout = result.stdout.decode("utf-8", errors="replace") if result.stdout else ""
    if result.returncode != 0:
        stderr = result.stderr.decode("utf-8", errors="replace") if result.stderr else "unknown error"
        err = stderr.strip()[:500]
        print(f"[AUDIO API] {desc} failed (code {result.returncode}): {err}")
        raise RuntimeError(f"FFmpeg error: {err}")
    return stdout

def _free_vram():
    import gc, torch
    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()

def _get_audio_duration(path: str) -> float:
    if not os.path.exists(path): return 0.0
    try:
        import wave
        with wave.open(path, 'r') as wav:
            return wav.getnframes() / float(wav.getframerate())
    except Exception:
        return 0.0

def _make_fallback_response(fragments, reason: str = "", audio_dur: float = 0.0):
    results, cur_time = [], 0.0
    for idx, frag in enumerate(fragments):
        dur = max(len(frag.text.split()) / 2.5, 1.0)
        end_time = cur_time + dur
        if idx == len(fragments) - 1 and audio_dur > 0:
            end_time = max(end_time, audio_dur)
        results.append({
            "id": frag.id,
            "startTime": round(cur_time, 3),
            "endTime": round(end_time, 3),
        })
        cur_time = end_time + 0.1
    return {
        "status": "ok",
        "fragments_timings": results,
        "fallback": True,
        "reason": reason
    }

@router.post("/vram/unload")
async def unload_vram_endpoint():
    print("[VRAM] Запрос на ручную очистку памяти GPU...")
    OmniVoiceProvider.unload_model()
    _free_vram()
    return {"status": "ok", "detail": "VRAM полностью очищена"}



@router.post("/generate")
async def generate_audio(request: AudioGenerationRequest):
    print(f"\n[AUDIO API] \u0417\u0430\u043f\u0440\u043e\u0441 \u043d\u0430 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u044e \u0434\u043b\u044f \u0444\u0440\u0430\u0433\u043c\u0435\u043d\u0442\u0430: {request.fragment_id}")

    if not request.project_path:
        request.project_path = "vidora_projects"

    try:
        os.makedirs(request.project_path, exist_ok=True)
    except Exception as e:
        print(f"[AUDIO API] \u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f \u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440\u0438\u0438: {e}")

    try:
        result = await audio_service.generate(request)
        return result
    except Exception as e:
        print(f"[AUDIO API] \u041e\u0448\u0438\u0431\u043a\u0430 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0438: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-ref")
async def upload_ref(project_path: str = Form(default="vidora_projects"), file: UploadFile = File(...)):
    os.makedirs(project_path, exist_ok=True)
    refs_dir = os.path.join(project_path, "assets", "refs")
    os.makedirs(refs_dir, exist_ok=True)

    file_path = os.path.join(refs_dir, file.filename)
    file_path = os.path.normpath(os.path.abspath(file_path))

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    return {"status": "ok", "ref_audio_path": file_path}

@router.post("/process")
async def process_audio(request: AudioProcessRequest):
    audio_path = _resolve_path(request.audio_path, request.project_path)

    if not os.path.exists(audio_path):
        return {"status": "error", "detail": f"Файл не найден: {audio_path}"}

    backup_path = audio_path + ".bak"
    if not os.path.exists(backup_path):
        shutil.copy2(audio_path, backup_path)

    temp_out = audio_path + ".tmp.wav"

    cmds = {
        "normalize": ["ffmpeg", "-y", "-i", audio_path, "-af", "loudnorm=I=-14:LRA=11:TP=-1.5", temp_out],
        "denoise": ["ffmpeg", "-y", "-i", audio_path, "-af", "highpass=f=80,afftdn", temp_out],
        "enhance": ["ffmpeg", "-y", "-i", audio_path, "-af", "highpass=f=80,acompressor,equalizer=f=3000:width_type=h:width=200:g=3", temp_out],
        "mastering": ["ffmpeg", "-y", "-i", audio_path, "-af", "highpass=f=80,afftdn,acompressor=ratio=4:makeup=2,loudnorm=I=-14:LRA=11:TP=-1.5", temp_out],
    }

    if request.action == "silero_vad":
        try:
            import torch
            import torchaudio
            print(f"[AUDIO API] Запуск Silero VAD для: {audio_path}")
            
            # Загружаем модель VAD
            model, utils = torch.hub.load(repo_or_dir='snakers4/silero-vad', model='silero_vad', trust_repo=True, force_reload=False)
            (get_speech_timestamps, save_audio, read_audio, VADIterator, collect_chunks) = utils
            
            # Модель ожидает частоту 16000 Гц для распознавания
            wav_16k = read_audio(audio_path, sampling_rate=16000)
            speech_timestamps = get_speech_timestamps(wav_16k, model, sampling_rate=16000)
            
            if not speech_timestamps:
                print(f"[AUDIO API] Silero VAD: Речь не найдена, копируем оригинал.")
                shutil.copy2(audio_path, temp_out)
            else:
                # Читаем исходный файл (с его родной частотой дискретизации), чтобы сохранить качество
                wav_orig, sr = torchaudio.load(audio_path)
                chunks = []
                for chunk in speech_timestamps:
                    # Добавляем 0.1s padding (100 мс) до и после найденной речи для плавности
                    start_idx = max(0, int((chunk['start'] / 16000.0 - 0.1) * sr))
                    end_idx = min(wav_orig.shape[1], int((chunk['end'] / 16000.0 + 0.1) * sr))
                    chunks.append(wav_orig[:, start_idx:end_idx])
                
                if chunks:
                    concatenated = torch.cat(chunks, dim=1)
                    torchaudio.save(temp_out, concatenated, sr)
                else:
                    shutil.copy2(audio_path, temp_out)

        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[AUDIO API] Silero VAD Error: {e}")
            return {"status": "error", "detail": f"Silero VAD error: {str(e)}"}
            
    elif request.action in cmds:
        try:
            _run_ffmpeg(cmds[request.action], desc=f"process/{request.action}")
        except RuntimeError as e:
            return {"status": "error", "detail": str(e)}
    else:
        return {"status": "error", "detail": "Неизвестное действие"}

    if not os.path.exists(temp_out):
        return {"status": "error", "detail": "Выходной файл не создан"}

    shutil.move(temp_out, audio_path)
    return {"status": "ok", "processed_audio_path": audio_path, "action_applied": request.action}

@router.post("/undo")
async def undo_audio(request: AudioProcessRequest):
    audio_path = _resolve_path(request.audio_path, request.project_path)
    backup_path = audio_path + ".bak"

    if os.path.exists(backup_path):
        shutil.copy2(backup_path, audio_path)
        return {"status": "ok", "processed_audio_path": audio_path, "detail": "\u0418\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f \u043e\u0442\u043c\u0435\u043d\u0435\u043d\u044b"}
    return {"status": "error", "detail": "\u041d\u0435\u0442 \u0438\u0441\u0442\u043e\u0440\u0438\u0438 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439 \u0434\u043b\u044f \u043e\u0442\u043a\u0430\u0442\u0430"}

@router.post("/process/advanced-silence")
async def process_advanced_silence(req: AdvancedSilenceRequest):
    audio_path = _resolve_path(req.audio_path, req.project_path)
    if not os.path.exists(audio_path):
        return {"status": "error", "detail": "Файл не найден"}

    from pydub import AudioSegment
    from pydub.silence import detect_silence

    audio = AudioSegment.from_file(audio_path)
    silences = detect_silence(audio, min_silence_len=req.min_silence_ms, silence_thresh=req.threshold_db)

    if not silences:
        return {"status": "ok", "processed_audio_path": audio_path, "new_duration_sec": len(audio) / 1000.0}

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
    return {"status": "ok", "processed_audio_path": audio_path, "new_duration_sec": len(result) / 1000.0}

@router.post("/concat")
async def concat_audio(request: AudioConcatRequest):
    out_path = _resolve_path(request.output_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    list_file = out_path + ".list.txt"
    try:
        with open(list_file, "w", encoding="utf-8") as f:
            for p in request.audio_paths:
                abs_p = _resolve_path(p)
                if os.path.exists(abs_p):
                    formatted_p = abs_p.replace("\\", "/")
                    f.write(f"file '{formatted_p}'\n")
        try:
            _run_ffmpeg(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", out_path],
                desc="concat",
            )
        except RuntimeError:
            _run_ffmpeg(
                ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, out_path],
                desc="concat (re-encode)",
            )
        return {"status": "ok", "output_path": out_path}
    except Exception as e:
        print(f"[AUDIO API] Concat status: {e}")
        return {"status": "error", "detail": str(e)}
    finally:
        if os.path.exists(list_file):
            os.remove(list_file)

@router.post("/sync")
async def sync_audio(request: AudioSyncRequest):
    audio_path = _resolve_path(request.audio_path, request.project_path)
    audio_dur = _get_audio_duration(audio_path)
    print(f"\n[AUDIO SYNC] === Старт синхронизации сцены: '{request.scene_id}' ===")
    print(f"[AUDIO SYNC] Whisper: {request.use_whisper} | Auto Offload VRAM: {request.auto_offload_vram} | Audio Dur: {audio_dur:.2f}s")

    if not request.use_whisper:
        print("[AUDIO SYNC] [CONFIG] Whisper отключен в UI. Применение FALLBACK.")
        return _make_fallback_response(request.fragments, reason="Whisper отключен в настройках UI", audio_dur=audio_dur)

    if not os.path.exists(audio_path):
        print(f"[AUDIO SYNC] [WARN] Аудиофайл НЕ НАЙДЕН: '{audio_path}'. Применение FALLBACK.")
        return _make_fallback_response(request.fragments, reason="Файл аудио не найден", audio_dur=audio_dur)

    if request.auto_offload_vram:
        print("[AUDIO SYNC] [VRAM] Выгрузка OmniVoice из памяти GPU...")
        OmniVoiceProvider.unload_model()

    try:
        import whisperx
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"
        print(f"[AUDIO SYNC] [INFO] Загрузка WhisperX (device={device}, compute_type={compute_type})...")

        model = whisperx.load_model("base", device=device, compute_type=compute_type, download_root=WHISPER_MODEL_DIR)
        audio = whisperx.load_audio(audio_path)

        print("[AUDIO SYNC] [INFO] Транскрибация речи...")
        result = model.transcribe(audio, batch_size=8)
        lang = result.get("language", "ru")

        recognized_words = []
        try:
            print(f"[AUDIO SYNC] [INFO] Выравнивание (Alignment) для языка '{lang}'...")
            model_a, metadata = whisperx.load_align_model(
                language_code=lang, device=device, model_dir=WHISPER_MODEL_DIR
            )
            aligned_res = whisperx.align(
                result["segments"], model_a, metadata, audio, device, return_char_alignments=False
            )
            for segment in aligned_res.get("segments", []):
                for w in segment.get("words", []):
                    if "start" in w and "end" in w:
                        recognized_words.append(w)
        except Exception as align_err:
            print(f"[AUDIO SYNC] [WARN] Модель выравнивания не загрузилась ({align_err}). Используем слова Whisper.")
            for segment in result.get("segments", []):
                for w in segment.get("words", []):
                    if "start" in w and "end" in w:
                        recognized_words.append(w)

        all_reco_texts = [w["word"].strip().lower() for w in recognized_words]

        if not recognized_words:
            print("[AUDIO SYNC] [WARN] Слова не распознаны. Переход на FALLBACK.")
            return _make_fallback_response(request.fragments, reason="Слова не распознаны в аудио")
        results = []
        reco_cursor = 0

        for idx, frag in enumerate(request.fragments):
            frag_words = frag.text.lower().split()
            if not frag_words:
                continue

            best_start = None
            best_ratio = 0.0
            search_end = len(all_reco_texts) - len(frag_words) + 1
            for i in range(reco_cursor, search_end):
                chunk = all_reco_texts[i:i + len(frag_words)]
                ratio = difflib.SequenceMatcher(None, frag_words, chunk).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_start = i
                if ratio == 1.0:
                    break

            if best_start is not None and best_ratio > 0.3:
                chunk_words = recognized_words[best_start:best_start + len(frag_words)]
                start_time = chunk_words[0]["start"]
                # ponytail: Whisper cuts trailing breath/echo. Add 0.3s padding.
                end_time = chunk_words[-1]["end"] + 0.3

                # ponytail: Final fragment stretches to the exact end of the audio file to prevent FFmpeg truncation
                if idx == len(request.fragments) - 1 and audio_dur > 0:
                    end_time = max(end_time, audio_dur)

                reco_cursor = best_start + len(frag_words)
            else:
                prev_end = results[-1]["endTime"] if results else 0.0
                dur = max(len(frag_words) * 0.4, 1.0)
                start_time = prev_end
                end_time = prev_end + dur

                if idx == len(request.fragments) - 1 and audio_dur > 0:
                    end_time = max(end_time, audio_dur)

            results.append({
                "id": frag.id,
                "startTime": round(start_time, 3),
                "endTime": round(end_time, 3),
            })

        print(f"[AUDIO SYNC] [OK] WHISPERX УСПЕШНО сработал!")
        return {"status": "ok", "fragments_timings": results, "fallback": False}

    except Exception as e:
        print(f"[AUDIO SYNC] [ERROR] Ошибка WhisperX ({type(e).__name__}: {e}). Переход на FALLBACK.")
        _free_vram()
        return _make_fallback_response(request.fragments, reason=str(e))
