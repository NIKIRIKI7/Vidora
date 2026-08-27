"""Sidechain компрессия и эквализация фоновой музыки под голос."""

from pathlib import Path
from typing import Optional

from app.domain.schemas.audio import BackgroundMusicSchema
from app.infrastructure.media.ffmpeg import AsyncFFmpegRunner
from app.utils.audio_utils import get_audio_duration_sync


def build_ducking_filtergraph(
        settings: BackgroundMusicSchema, total_duration: float, is_preview: bool = False
) -> str:
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
        f"[music_pre][0:a]sidechaincompress=threshold={settings.threshold:.3f}:ratio={attenuation_ratio:.2f}:attack={settings.attack_ms}:release={settings.release_ms}:knee=2.5[music_ducked]",
    ]
    if fade_out:
        parts.append(
            f"[music_ducked]afade=t=out:st={fade_out_start:.2f}:d={settings.fade_out_sec}[music_final]"
        )
        parts.append("[0:a][music_final]amix=inputs=2:duration=longest:dropout_transition=2[mixed]")
    else:
        parts.append(
            "[0:a][music_ducked]amix=inputs=2:duration=longest:dropout_transition=2[mixed]"
        )

    parts.append("[mixed]alimiter=limit=0.96:attack=5:release=50[out]")
    return ";".join(parts)


async def mix_voice_and_music_ducking(
        voice_path: Path | str,
        music_path: Path | str,
        output_path: Path | str,
        settings: BackgroundMusicSchema,
        total_duration: Optional[float] = None,
) -> Path:
    dur = total_duration or get_audio_duration_sync(str(voice_path)) or 10.0
    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)

    filtergraph = build_ducking_filtergraph(settings, dur)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(voice_path),
        "-stream_loop",
        "-1",
        "-i",
        str(music_path),
        "-filter_complex",
        filtergraph,
        "-map",
        "[out]",
        "-c:a",
        "pcm_s16le",
        "-ar",
        "48000",
        "-t",
        str(dur),
        str(out_p),
    ]
    await AsyncFFmpegRunner.run(cmd, desc="Sidechain Ducking")
    return out_p
