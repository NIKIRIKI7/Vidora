import os
import re
import glob
import json
import subprocess
from typing import Dict, Any

class YouTubeParser:
    @staticmethod
    def _clean_vtt(raw_vtt: str) -> str:
        """Очищает VTT файл от таймкодов, тегов и дубликатов строк."""
        cleaned = re.sub(r'<[^>]+>', '', raw_vtt)
        cleaned = re.sub(r'[\d]{2}:[\d]{2}:[\d]{2}\.[\d]{3} --> .*', '', cleaned)
        cleaned = re.sub(r'WEBVTT|Kind: captions|Language: .*', '', cleaned)
        lines = [l.strip() for l in cleaned.split("\n") if l.strip()]

        unique_lines = []
        for line in lines:
            if not unique_lines or unique_lines[-1] != line:
                unique_lines.append(line)

        return re.sub(r'\s+', ' ', " ".join(unique_lines))

    @staticmethod
    def download_metadata_and_subs(video_id: str, video_url: str, output_dir: str, lang: str = "ru") -> Dict[str, Any]:
        abs_output_dir = os.path.abspath(output_dir)
        os.makedirs(abs_output_dir, exist_ok=True)

        print(f"[YT_PARSER] Запуск yt-dlp для видео: {video_id}")

        sub_langs = f"{lang},ru,en,en-US,es"

        cmd = [
            "yt-dlp", "--skip-download",
            "--write-auto-sub", "--write-sub",
            "--sub-format", "vtt",
            "--sub-lang", sub_langs,
            "--write-info-json",
            "-o", f"{abs_output_dir}/%(id)s.%(ext)s",
            video_url,
        ]

        try:
            subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
        except subprocess.TimeoutExpired:
            print(f"[YT_PARSER] Таймаут yt-dlp для видео {video_id}. Идем дальше...")
        except Exception as e:
            print(f"[YT_PARSER] Ошибка запуска yt-dlp: {e}")

        transcript = ""
        vtt_files = sorted(glob.glob(os.path.join(abs_output_dir, f"{video_id}*.vtt")))
        if vtt_files:
            try:
                with open(vtt_files[0], "r", encoding="utf-8") as f:
                    transcript = YouTubeParser._clean_vtt(f.read())
                print(f"[YT_PARSER] Транскрипция успешна для {video_id} (длина: {len(transcript)} симв.)")
            except Exception as e:
                print(f"[YT_PARSER] Ошибка чтения VTT: {e}")
        else:
            print(f"[YT_PARSER] Субтитры не найдены для {video_id}")

        info_data = {}
        info_path = os.path.join(abs_output_dir, f"{video_id}.info.json")
        if os.path.exists(info_path):
            try:
                with open(info_path, "r", encoding="utf-8") as f:
                    info_data = json.load(f)
            except Exception:
                pass

        return {
            "video_id": video_id,
            "title": info_data.get("title", ""),
            "channel": info_data.get("channel", ""),
            "view_count": info_data.get("view_count", 0),
            "like_count": info_data.get("like_count", 0),
            "duration": info_data.get("duration", 0),
            "transcript_full": transcript,
            "transcript_sample": (transcript[:3000] + "...") if len(transcript) > 3000 else transcript,
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
    result = YouTubeParser._clean_vtt(sample)
    assert result == "Привет всем всем привет всем", result
    print("self-check OK:", result)