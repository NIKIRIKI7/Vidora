import os
import re
import glob
import json
import subprocess
from typing import Dict, Any, List

from app.services.yt_normalizer import extract_video_id
from app.services.yt_scraper_service import YtScrapeService


class YouTubeParser:
    @staticmethod
    def clean_vtt(raw_vtt: str) -> str:
        cleaned = re.sub(r'<[^>]+>', '', raw_vtt)
        cleaned = re.sub(r'[\d]{2}:[\d]{2}:[\d]{2}\.[\d]{3} --> .*', '', cleaned)
        cleaned = re.sub(r'WEBVTT|Kind: captions|Language: .*', '', cleaned)
        lines = [l.strip() for l in cleaned.split("\n") if l.strip()]
        unique_lines = []
        for line in lines:
            if not unique_lines or unique_lines[-1] != line:
                unique_lines.append(line)
        return re.sub(r'\s+', ' ', " ".join(unique_lines)).strip()

    @classmethod
    def download_metadata_and_subs(
        cls, video_url: str, output_dir: str, lang: str = "ru", video_id: str = ""
    ) -> Dict[str, Any]:
        """
        Загрузка метаданных, транскрипта и топ-комментариев.
        Приоритет: ytscrape (в память) -> Fallback: yt-dlp.
        """
        v_id = video_id or extract_video_id(video_url)
        abs_output_dir = os.path.abspath(output_dir)
        os.makedirs(abs_output_dir, exist_ok=True)

        transcript = ""
        top_comments = []
        info_data = {}
        thumbnail_path = ""

        if YtScrapeService.is_available() and v_id:
            try:
                transcript = YtScrapeService.get_transcript_sync(v_id, [lang, "ru", "en", "es"])
                top_comments = YtScrapeService.get_comments_sync(v_id, max_comments=15)
            except Exception as e:
                print(f"[YT_PARSER WARN] ytscrape extraction failed: {e}")

        if not transcript:
            sub_langs = f"{lang},ru,en,en-US,es"
            cmd = [
                "yt-dlp", "--skip-download",
                "--write-auto-sub", "--write-sub",
                "--sub-format", "vtt",
                "--sub-lang", sub_langs,
                "--write-thumbnail",
                "--write-info-json",
                "-o", f"{abs_output_dir}/%(id)s.%(ext)s",
                video_url,
            ]
            try:
                subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
            except Exception as e:
                print(f"[YT_PARSER] Ошибка запуска yt-dlp: {e}")

            vtt_files = sorted(glob.glob(os.path.join(abs_output_dir, f"{v_id}*.vtt")))
            if vtt_files:
                try:
                    with open(vtt_files[0], "r", encoding="utf-8") as f:
                        transcript = cls.clean_vtt(f.read())
                except Exception as e:
                    print(f"[YT_PARSER] Ошибка чтения VTT: {e}")

        info_path = os.path.join(abs_output_dir, f"{v_id}.info.json")
        if os.path.exists(info_path):
            try:
                with open(info_path, "r", encoding="utf-8") as f:
                    info_data = json.load(f)
            except Exception:
                pass

        if not info_data and v_id:
            info_data = YtScrapeService.get_video_info_sync(v_id)

        for ext in ("webp", "jpg", "png"):
            p = os.path.join(abs_output_dir, f"{v_id}.{ext}")
            if os.path.exists(p):
                thumbnail_path = p
                break

        comments_summary = "\n".join([f"- {c['author']} (👍 {c['likes']}): {c['text']}" for c in top_comments[:10]])

        return {
            "video_id": v_id,
            "title": info_data.get("title", ""),
            "channel": info_data.get("channel", ""),
            "view_count": info_data.get("view_count", 0),
            "like_count": info_data.get("like_count", 0),
            "duration": info_data.get("duration", 0),
            "thumbnail_path": thumbnail_path,
            "transcript_full": transcript,
            "transcript_sample": (transcript[:3000] + "...") if len(transcript) > 3000 else transcript,
            "top_comments": top_comments,
            "comments_summary": comments_summary,
        }


if __name__ == "__main__":
    sample = (
        "WEBVTT\nKind: captions\nLanguage: en\n"
        "00:00:01.000 --> 00:00:03.000 align:start\n"
        "<c>Привет</c> всем\n"
        "00:00:03.500 --> 00:00:05.000\n"
        "всем\n"
        "00:00:05.500 --> 00:00:08.000\n"
        "привет всем\n"
    )
    result = YouTubeParser.clean_vtt(sample)
    assert result == "Привет всем всем привет всем", result
    print("self-check OK:", result)
