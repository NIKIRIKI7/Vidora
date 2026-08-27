"""Адаптер скачивания метаданных, субтитров и обложек YouTube видео."""

import glob
import json
import asyncio
from pathlib import Path
from typing import Any, Dict

from app.infrastructure.youtube.circuit_cache import DeepTrendCircuitCache
from app.infrastructure.youtube.normalizer import extract_video_id, clean_vtt
from app.infrastructure.youtube.scraper import YtScrapeService
from app.infrastructure.youtube.whisper_transcriber import WhisperTranscriber


class YouTubeMetadataDownloader:
    @staticmethod
    async def download(
        video_url: str,
        output_dir: Path | str,
        lang: str = "ru",
        enable_whisper_fallback: bool = True,
    ) -> Dict[str, Any]:
        v_id = extract_video_id(video_url)
        cache_key = f"meta_{v_id}_{lang}"
        cached = DeepTrendCircuitCache.get_l3(cache_key)
        if cached is not None:
            return cached

        out_dir = Path(output_dir).resolve()
        out_dir.mkdir(parents=True, exist_ok=True)

        transcript = ""
        transcript_status = "none"
        top_comments = []
        info_data: Dict[str, Any] = {}
        thumbnail_path = ""

        # 1. Попытка быстрого получения через ytscrape
        if YtScrapeService.is_available() and v_id:
            try:
                transcript = await YtScrapeService.get_transcript(v_id, [lang, "ru", "en", "es"])
                if transcript:
                    transcript_status = "official_subtitles"
                top_comments = await YtScrapeService.get_comments(v_id, max_comments=15)
            except Exception:
                pass

        # 2. Fallback через yt-dlp если транскрипт пуст
        if not transcript:
            sub_langs = f"{lang},ru,en,en-US,es"
            cmd = [
                "yt-dlp", "--skip-download", "--write-auto-sub", "--write-sub",
                "--sub-format", "vtt", "--sub-lang", sub_langs, "--write-thumbnail",
                "--write-info-json", "-o", f"{out_dir}/%(id)s.%(ext)s", video_url,
            ]
            try:
                process = await asyncio.create_subprocess_exec(
                    *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(process.communicate(), timeout=60.0)
            except Exception:
                pass

            vtt_files = sorted(glob.glob(str(out_dir / f"{v_id}*.vtt")))
            if vtt_files:
                try:
                    with open(vtt_files[0], "r", encoding="utf-8") as f:
                        transcript = clean_vtt(f.read())
                    if transcript:
                        transcript_status = "official_subtitles"
                except Exception:
                    pass

        # 3. ПОЛНАЯ транскрибация всего ролика через Whisper, если субтитров нет
        if not transcript and enable_whisper_fallback and v_id:
            whisper_full_text = await WhisperTranscriber.transcribe_audio_full(v_id, lang=lang)
            if whisper_full_text:
                transcript = whisper_full_text
                transcript_status = "whisper_fallback"

        info_path = out_dir / f"{v_id}.info.json"
        if info_path.exists():
            try:
                with open(info_path, "r", encoding="utf-8") as f:
                    info_data = json.load(f)
            except Exception:
                pass

        if not info_data and v_id:
            info_data = await YtScrapeService.get_video_info(v_id)

        for ext in ("webp", "jpg", "png"):
            p = out_dir / f"{v_id}.{ext}"
            if p.exists():
                thumbnail_path = str(p)
                break

        comments_summary = "\n".join([f"- {c['author']} (👍 {c['likes']}): {c['text']}" for c in top_comments[:10]])

        res = {
            "video_id": v_id,
            "title": info_data.get("title", ""),
            "channel": info_data.get("channel", ""),
            "view_count": info_data.get("view_count", 0),
            "like_count": info_data.get("like_count", 0),
            "duration": info_data.get("duration", 0),
            "thumbnail_path": thumbnail_path,
            "transcript_full": transcript,
            "transcript_sample": (transcript[:3000] + "...") if len(transcript) > 3000 else transcript,
            "transcript_status": transcript_status,
            "top_comments": top_comments,
            "comments_summary": comments_summary,
        }

        DeepTrendCircuitCache.set_l3(cache_key, res)
        return res
