import os
import wave
import subprocess
import difflib
import re
import asyncio
from pathlib import Path
from typing import Optional

from app.schemas import AudioGenerationRequest, BackgroundMusicSchema, DuckingPreviewRequest
from app.services.audio_provider import BaseTTSProvider, TTSProviderFactory, clean_voice_tags
from app.services.lavasr_enhancer import LavaSREnhancer
from app.services.gpu_manager import GPUManager
from app.ws_manager import manager

WHISPER_MODEL_DIR = str(Path(__file__).resolve().parents[2] / "ai-models")
BACKEND_DIR = Path(__file__).resolve().parents[2]

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

def build_ducking_filtergraph(settings: BackgroundMusicSchema, total_duration: float, is_preview: bool = False) -> str:
    base_vol = max(0.01, settings.base_volume)
    duck_vol = max(0.005, settings.ducked_volume)
    attenuation_ratio = max(1.5, min(15.0, base_vol / duck_vol))
    fade_out_start = max(0.0, total_duration - settings.fade_out_sec)

    eq_filters = []
    if settings.eq:
        if settings.eq.enable_low_cut:
            eq_filters.append(f"highpass=f={settings.eq.low_cut_freq}")
        if settings.eq.enable_mid_carve:
            eq_filters.append(
                f"equalizer=f={settings.eq.mid_carve_freq}:width_type=o:width=1.5:g={settings.eq.mid_carve_gain}"
            )
    eq_chain = "," + ",".join(eq_filters) if eq_filters else ""

    fade_in = "" if is_preview else f",afade=t=in:st=0:d={settings.fade_in_sec}"
    fade_out = "" if is_preview else f",afade=t=out:st={fade_out_start:.2f}:d={settings.fade_out_sec}"

    parts = [
        f"[1:a]volume={base_vol:.3f}{eq_chain}{fade_in}[music_pre]",
        f"[music_pre][0:a]sidechaincompress="
        f"threshold={settings.threshold:.3f}:ratio={attenuation_ratio:.2f}:"
        f"attack={settings.attack_ms}:release={settings.release_ms}:knee=2.5[music_ducked]",
    ]

    if fade_out:
        parts.append(f"[music_ducked]afade=t=out:st={fade_out_start:.2f}:d={settings.fade_out_sec}[music_final]")
        parts.append("[0:a][music_final]amix=inputs=2:duration=longest:dropout_transition=2[mixed]")
    else:
        parts.append("[0:a][music_ducked]amix=inputs=2:duration=longest:dropout_transition=2[mixed]")

    parts.append("[mixed]alimiter=limit=0.96:attack=5:release=50[out]")
    return ";".join(parts)

def mix_voice_and_music_ducking(
    voice_path: str,
    music_path: str,
    output_path: str,
    settings: BackgroundMusicSchema,
    total_duration: Optional[float] = None,
) -> str:
    if not os.path.exists(voice_path):
        raise FileNotFoundError(f"Файл голоса не найден: {voice_path}")
    if not os.path.exists(music_path):
        raise FileNotFoundError(f"Файл музыки не найден: {music_path}")

    dur = total_duration or _get_audio_duration(voice_path)
    if dur <= 0:
        dur = 10.0

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    filtergraph = build_ducking_filtergraph(settings, dur)

    cmd = [
        "ffmpeg", "-y",
        "-i", str(voice_path),
        "-stream_loop", "-1",
        "-i", str(music_path),
        "-filter_complex", filtergraph,
        "-map", "[out]",
        "-c:a", "pcm_s16le",
        "-ar", "48000",
        "-t", str(dur),
        str(output_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg ducking error: {res.stderr[-600:]}")
    return output_path

def generate_ducking_preview(req: DuckingPreviewRequest) -> str:
    dur = max(3.0, min(30.0, req.preview_duration))
    preview_dir = os.path.join(req.project_path, "assets", "voice")
    os.makedirs(preview_dir, exist_ok=True)
    output_path = os.path.join(preview_dir, "preview_ducking_temp.mp3")

    dummy_schema = BackgroundMusicSchema(
        enabled=True,
        base_volume=req.base_volume,
        ducked_volume=req.ducked_volume,
        threshold=req.threshold,
        attack_ms=req.attack_ms,
        release_ms=req.release_ms,
        fade_in_sec=req.fade_in_sec,
        fade_out_sec=req.fade_out_sec,
        eq=req.eq,
    )
    filtergraph = build_ducking_filtergraph(dummy_schema, dur, is_preview=True)

    cmd = [
        "ffmpeg", "-y",
        "-ss", "0.0", "-t", str(dur), "-i", str(req.voice_path),
        "-stream_loop", "-1",
        "-ss", "0.0", "-t", str(dur), "-i", str(req.music_path),
        "-filter_complex", filtergraph,
        "-map", "[out]",
        "-c:a", "libmp3lame",
        "-b:a", "192k",
        "-t", str(dur),
        str(output_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, errors="replace")
    if res.returncode != 0:
        raise RuntimeError(f"FFmpeg preview error: {res.stderr[-500:]}")
    return output_path

def clean_leaks_with_whisper(audio_path: str, target_text: str) -> float:
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
        if first_match_idx > 0 and best_start_ratio >= 0.4:
            leaked_start_sec = reco_words[first_match_idx]["start"]
            if leaked_start_sec > 0.35:
                cut_start = max(0.0, leaked_start_sec - 0.1)

        if last_match_idx < len(reco_words) - 1 and best_end_ratio >= 0.4:
            leaked_end_sec = reco_words[last_match_idx]["end"]
            if leaked_end_sec < total_dur - 0.5:
                cut_end = min(total_dur, leaked_end_sec + 0.25)

        if cut_start > 0.1 or cut_end < (total_dur - 0.2):
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
    except Exception:
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

        # Монопольный захват GPU: TTS + Whisper leak-clean + LavaSR не пересекаются по VRAM
        async with GPUManager.run_exclusive():
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

            await asyncio.to_thread(clean_leaks_with_whisper, output_path, request.text)

            if request.postprocess_output:
                try:
                    await asyncio.to_thread(
                        LavaSREnhancer.enhance_file,
                        output_path,
                        output_path,
                        True,
                        bool(request.denoise),
                    )
                except Exception as enh_err:
                    print(f"[AUDIO SERVICE] Ошибка LavaSR апскейла: {enh_err}")

        duration = await asyncio.to_thread(_get_audio_duration, output_path)

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


if __name__ == "__main__":
    # pure-logic check: генерация filtergraph дакинга (без сети/ffmpeg)
    s = BackgroundMusicSchema(base_volume=0.35, ducked_volume=0.12, eq=None)
    fg = build_ducking_filtergraph(s, 30.0)
    assert "sidechaincompress=threshold=0.080:ratio=2.92:" in fg
    assert "afade=t=in:st=0:d=1.0" in fg
    assert "afade=t=out:st=28.50:d=1.5" in fg
    assert fg.endswith("[out]")
    fgp = build_ducking_filtergraph(s, 30.0, is_preview=True)
    assert "afade" not in fgp
    assert "[0:a][music_ducked]amix" in fgp
    s_eq = BackgroundMusicSchema(eq={"enable_low_cut": True, "low_cut_freq": 80, "enable_mid_carve": True, "mid_carve_freq": 2500, "mid_carve_gain": -3.5})
    fg_eq = build_ducking_filtergraph(s_eq, 60.0)
    assert "highpass=f=80" in fg_eq
    assert "equalizer=f=2500:width_type=o:width=1.5:g=-3.5" in fg_eq
    print("audio_service ducking selfcheck OK")
