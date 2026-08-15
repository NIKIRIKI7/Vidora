import os
import wave
import subprocess
import difflib
import re
from pathlib import Path
from app.schemas import AudioGenerationRequest
from app.services.audio_provider import BaseTTSProvider, TTSProviderFactory, clean_voice_tags
from app.services.lavasr_enhancer import LavaSREnhancer
from app.ws_manager import manager

WHISPER_MODEL_DIR = str(Path(__file__).resolve().parents[2] / "ai-models")

def _get_audio_duration(path: str) -> float:
    if not os.path.exists(path):
        return 0.0
    try:
        with wave.open(path, 'r') as wav_file:
            return wav_file.getnframes() / float(wav_file.getframerate())
    except Exception:
        try:
            out = subprocess.run(
                ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                capture_output=True, text=True,
            )
            return float(out.stdout.strip()) if out.stdout.strip() else 0.0
        except Exception:
            return 0.0

def clean_leaks_with_whisper(audio_path: str, target_text: str) -> float:
    """
    Автоматически находит и вырезает через Whisper любые зачитанные моделью промпты 
    (например, 'energetically, excitedly and quickly') в начале и галлюцинации в конце.
    """
    total_dur = _get_audio_duration(audio_path)
    if total_dur < 1.0 or not os.path.exists(audio_path):
        return total_dur

    clean_target = clean_voice_tags(target_text)
    target_words = [w.lower() for w in re.findall(r'[\w\u0400-\u04FF]+', clean_target)]
    if not target_words:
        return total_dur

    try:
        import whisperx
        import torch

        device = "cuda" if torch.cuda.is_available() else "cpu"
        compute_type = "float16" if device == "cuda" else "int8"

        # Быстрый прогон через Whisper для получения таймкодов слов
        model = whisperx.load_model("tiny", device=device, compute_type=compute_type, download_root=WHISPER_MODEL_DIR)
        audio_data = whisperx.load_audio(audio_path)
        res = model.transcribe(audio_data, batch_size=8, language="ru")

        del model
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        segments = res.get("segments", [])
        if not segments:
            return total_dur

        reco_words = []
        for seg in segments:
            seg_text_words = re.findall(r'[\w\u0400-\u04FF]+', seg.get("text", "").lower())
            seg_dur = max(0.1, seg["end"] - seg["start"])
            if seg_text_words:
                w_dur = seg_dur / len(seg_text_words)
                for i, sw in enumerate(seg_text_words):
                    reco_words.append({
                        "word": sw,
                        "start": seg["start"] + i * w_dur,
                        "end": seg["start"] + (i + 1) * w_dur
                    })

        if not reco_words:
            return total_dur

        reco_text_list = [w["word"] for w in reco_words]

        # Ищем начало первого реального слова из целевого текста
        first_few_target = target_words[:min(4, len(target_words))]
        first_match_idx = 0
        best_start_ratio = 0.0

        for i in range(min(12, len(reco_text_list))):
            chunk = reco_text_list[i:i + len(first_few_target)]
            ratio = difflib.SequenceMatcher(None, first_few_target, chunk).ratio()
            if ratio > best_start_ratio and ratio >= 0.4:
                best_start_ratio = ratio
                first_match_idx = i
                if ratio >= 0.75:
                    break

        # Ищем конец последнего реального слова из целевого текста
        last_few_target = target_words[max(0, len(target_words) - 4):]
        last_match_idx = len(reco_words) - 1
        best_end_ratio = 0.0

        for i in range(len(reco_text_list) - len(last_few_target), max(-1, len(reco_text_list) - 16), -1):
            if i < 0:
                continue
            chunk = reco_text_list[i:i + len(last_few_target)]
            ratio = difflib.SequenceMatcher(None, last_few_target, chunk).ratio()
            if ratio > best_end_ratio and ratio >= 0.4:
                best_end_ratio = ratio
                last_match_idx = i + len(last_few_target) - 1
                if ratio >= 0.75:
                    break

        cut_start = 0.0
        cut_end = total_dur

        # Если в начале обнаружен зачитанный промпт (сдвиг более чем на 0.35 сек)
        if first_match_idx > 0 and best_start_ratio >= 0.4:
            leaked_start_sec = reco_words[first_match_idx]["start"]
            if leaked_start_sec > 0.35:
                cut_start = max(0.0, leaked_start_sec - 0.1)

        # Если в конце есть галлюцинации или мусор
        if last_match_idx < len(reco_words) - 1 and best_end_ratio >= 0.4:
            leaked_end_sec = reco_words[last_match_idx]["end"]
            if leaked_end_sec < total_dur - 0.5:
                cut_end = min(total_dur, leaked_end_sec + 0.25)

        # Применяем обрезку, если найдены лишние куски
        if cut_start > 0.1 or cut_end < (total_dur - 0.2):
            print(f"[WHISPER CLEANER] ✂️ Вырезаем лишнее: {cut_start:.2f}s -> {cut_end:.2f}s (из {total_dur:.2f}s)")
            temp_out = audio_path + ".clean.wav"
            trim_dur = cut_end - cut_start
            cmd = [
                "ffmpeg", "-y", "-ss", str(cut_start), "-t", str(trim_dur),
                "-i", audio_path,
                "-af", f"afade=t=in:st=0:d=0.04,afade=t=out:st={max(0, trim_dur - 0.08)}:d=0.08",
                temp_out
            ]
            subprocess.run(cmd, capture_output=True)
            if os.path.exists(temp_out) and os.path.getsize(temp_out) > 1000:
                os.replace(temp_out, audio_path)
                return _get_audio_duration(audio_path)

        return total_dur

    except Exception as e:
        print(f"[WHISPER CLEANER] Пропуск авто-обрезки: {e}")
        return total_dur


class AudioService:
    def __init__(self, provider: BaseTTSProvider = None):
        self.provider = provider

    def _get_provider(self, request: AudioGenerationRequest) -> BaseTTSProvider:
        if self.provider:
            return self.provider
        return TTSProviderFactory.get_provider(request.engine)

    async def generate(self, request: AudioGenerationRequest) -> dict:
        await manager.broadcast({
            "type": "AUDIO_GEN_PROGRESS",
            "payload": {
                "fragment_id": request.fragment_id,
                "status": "processing",
                "percent": 10,
            },
        })

        voice_dir = os.path.join(request.project_path, "assets", "voice")
        os.makedirs(voice_dir, exist_ok=True)
        filename = f"{request.file_prefix}_{request.fragment_id[:6]}.wav"
        output_path = os.path.join(voice_dir, filename)

        api_keys_dict = request.api_keys.model_dump() if request.api_keys else {}
        provider = self._get_provider(request)

        # 1. Генерация речи TTS
        await provider.generate_tts(
            text=request.text,
            voice_model=request.voice_model,
            guidance_scale=request.guidance_scale,
            num_steps=request.num_steps,
            speed=request.speed,
            duration=request.duration,
            denoise=request.denoise,
            preprocess_prompt=request.preprocess_prompt,
            postprocess_output=request.postprocess_output,
            output_path=output_path,
            ref_audio_path=request.ref_audio_path,
            ref_text=request.ref_text,
            design_prompt=request.design_prompt,
            api_keys=api_keys_dict,
        )

        # 2. Вырезание возможных артефактов / зачитанных промптов
        clean_leaks_with_whisper(output_path, request.text)

        # 3. Постобработка через LavaSR (BWE апскейл до студийных 48 кГц)
        if request.postprocess_output:
            try:
                # denoise=False для чистого синтеза исключает metallic артефакты
                LavaSREnhancer.enhance_file(
                    output_path,
                    output_path=output_path,
                    enhance=True,
                    denoise=bool(request.denoise),
                )
            except Exception as enh_err:
                print(f"[AUDIO SERVICE] Ошибка LavaSR апскейла: {enh_err}")

        duration = _get_audio_duration(output_path)

        await manager.broadcast({
            "type": "AUDIO_GEN_PROGRESS",
            "payload": {
                "fragment_id": request.fragment_id,
                "status": "done",
                "percent": 100,
            },
        })

        return {
            "status": "ok",
            "audio_url": filename,
            "absolute_path": os.path.abspath(output_path),
            "duration": round(duration, 3),
        }
