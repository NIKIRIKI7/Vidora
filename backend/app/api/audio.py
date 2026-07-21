import os
import shutil
import subprocess
import difflib
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from app.schemas import AudioGenerationRequest, AudioProcessRequest, AudioSyncRequest, AudioConcatRequest
from app.services.audio_service import AudioService

WHISPER_MODEL_DIR = str(Path(__file__).resolve().parents[2] / "ai-models")
os.environ.setdefault("HF_HOME", WHISPER_MODEL_DIR)
os.environ.setdefault("XDG_CACHE_HOME", WHISPER_MODEL_DIR)

router = APIRouter(prefix="/api/v1/audio", tags=["audio"])
audio_service = AudioService()

def _resolve_path(path: str, project_path: str = "") -> str:
    if os.path.isabs(path):
        return path
    if project_path:
        return os.path.normpath(os.path.join(project_path, path))
    return os.path.normpath(os.path.abspath(path))

@router.post("/generate")
async def generate_audio(request: AudioGenerationRequest):
    print(f"\n[AUDIO API] Запрос на генерацию для фрагмента: {request.fragment_id}")
    print(f"[AUDIO API] Текст: {request.text[:50]}...")
    print(f"[AUDIO API] Модель: {request.voice_model}, Путь проекта: {request.project_path}")

    if not os.path.exists(request.project_path):
        print(f"[AUDIO API] Предупреждение: путь '{request.project_path}' не существует. Создаю директорию.")
        try:
            os.makedirs(request.project_path, exist_ok=True)
        except Exception as e:
            print(f"[AUDIO API] Ошибка создания директории: {e}")
            raise HTTPException(status_code=400, detail=f"Невозможно создать директорию проекта: {e}")

    try:
        print("[AUDIO API] Запуск audio_service.generate()...")
        result = await audio_service.generate(request)
        print(f"[AUDIO API] Успешно сгенерировано: {result}")
        return result
    except Exception as e:
        print(f"[AUDIO API] Ошибка генерации: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload-ref")
async def upload_ref(project_path: str = Form(...), file: UploadFile = File(...)):
    if not project_path:
        raise HTTPException(status_code=400, detail="project_path не указан")

    os.makedirs(project_path, exist_ok=True)
    refs_dir = os.path.join(project_path, "assets", "refs")
    os.makedirs(refs_dir, exist_ok=True)

    file_path = os.path.join(refs_dir, file.filename)
    file_path = os.path.normpath(os.path.abspath(file_path))

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    print(f"[AUDIO API] Референс аудио сохранён: {file_path}")
    return {"status": "ok", "ref_audio_path": file_path}

@router.post("/process")
async def process_audio(request: AudioProcessRequest):
    audio_path = _resolve_path(request.audio_path, request.project_path)
    out_path = audio_path.replace(".wav", f"_{request.action}.wav")

    cmds = {
        "normalize": ["ffmpeg", "-y", "-i", audio_path, "-af", "loudnorm=I=-14:LRA=11:TP=-1.5", out_path],
        "remove_silence": ["ffmpeg", "-y", "-i", audio_path, "-af", "silenceremove=stop_periods=-1:stop_duration=0.3:stop_threshold=-35dB", out_path],
        "denoise": ["ffmpeg", "-y", "-i", audio_path, "-af", "highpass=f=80,afftdn", out_path],
        "enhance": ["ffmpeg", "-y", "-i", audio_path, "-af", "highpass=f=80,acompressor,equalizer=f=3000:width_type=h:width=200:g=3", out_path],
    }

    if request.action not in cmds:
        return {"status": "error", "detail": "Неизвестное действие"}

    subprocess.run(cmds[request.action], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if not os.path.exists(out_path):
        return {"status": "error", "detail": "FFmpeg не создал выходной файл"}

    return {"status": "ok", "processed_audio_path": out_path, "action_applied": request.action}

@router.post("/concat")
async def concat_audio(request: AudioConcatRequest):
    list_file = request.output_path + ".list.txt"
    try:
        with open(list_file, "w", encoding="utf-8") as f:
            for p in request.audio_paths:
                f.write(f"file '{p}'\n")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", request.output_path],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        return {"status": "ok", "output_path": request.output_path}
    except Exception as e:
        return {"status": "error", "detail": str(e)}
    finally:
        if os.path.exists(list_file):
            os.remove(list_file)

@router.post("/sync")
async def sync_audio(request: AudioSyncRequest):
    # ponytail: whisperx + difflib. Fallback — средняя скорость речи.
    audio_path = _resolve_path(request.audio_path, request.project_path)
    print(f"[AUDIO API] Sync: resolving audio_path='{request.audio_path}' + project_path='{request.project_path}' -> '{audio_path}'")
    if not os.path.exists(audio_path):
        print(f"[AUDIO API] Sync: файл не найден: {audio_path}, переключаюсь на fallback")
        results, cur_time = [], 0.0
        for frag in request.fragments:
            dur = max(len(frag.text.split()) / 2.5, 1.0)
            results.append({
                "id": frag.id,
                "startTime": round(cur_time, 3),
                "endTime": round(cur_time + dur, 3),
            })
            cur_time += dur + 0.1
        return {"status": "ok", "fragments_timings": results, "fallback": True}
    try:
        import whisperx
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"

        model = whisperx.load_model("base", device=device, compute_type=compute_type, download_root=WHISPER_MODEL_DIR)
        audio = whisperx.load_audio(audio_path)
        result = model.transcribe(audio, batch_size=8)

        model_a, metadata = whisperx.load_align_model(
            language_code=result["language"], device=device, model_dir=WHISPER_MODEL_DIR
        )
        result = whisperx.align(
            result["segments"], model_a, metadata, audio, device, return_char_alignments=False
        )

        recognized_words = []
        for segment in result["segments"]:
            for w in segment.get("words", []):
                if "start" in w and "end" in w:
                    recognized_words.append(w)

        all_reco_texts = [w["word"].strip().lower() for w in recognized_words]
        results = []
        reco_cursor = 0

        for frag in request.fragments:
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
                end_time = chunk_words[-1]["end"]
                reco_cursor = best_start + len(frag_words)
            else:
                prev_end = results[-1]["endTime"] if results else 0.0
                dur = max(len(frag_words) * 0.4, 1.0)
                start_time = prev_end
                end_time = prev_end + dur

            results.append({
                "id": frag.id,
                "startTime": round(start_time, 3),
                "endTime": round(end_time, 3),
            })

    except ImportError:
        results, cur_time = [], 0.0
        for frag in request.fragments:
            dur = max(len(frag.text.split()) / 2.5, 1.0)
            results.append({
                "id": frag.id,
                "startTime": round(cur_time, 3),
                "endTime": round(cur_time + dur, 3),
            })
            cur_time += dur + 0.1

    return {"status": "ok", "fragments_timings": results}
