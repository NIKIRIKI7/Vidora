"""Поиск вирусных видео-аномалий через трёхуровневый каскад источников.

  Tier-1: Innertube Direct Search (без API-ключа, < 120 мс)
  Tier-2: YtScrapeService (ytscrape)
  Tier-3: yt-dlp JSON fallback
Языковой валидатор (Cyrillic/Latin Gate) отсекает русскоязычные видео при поиске
на en, а запросы автоматически адаптируются под целевой язык.
"""

import asyncio
import json
import re
import subprocess
from typing import Any, Callable, Dict, List, Optional

from app.infrastructure.youtube.innertube import InnertubeClient
from app.infrastructure.youtube.normalizer import (
    clean_search_keyword,
    normalize_language_code,
    parse_published_to_hours,
    sanitize_channel_query,
)
from app.infrastructure.youtube.scraper import YtScrapeService


class YouTubeSearcher:
    """Мультиисточниковый поиск вирусных видео (Ratio views/subs >= min_ratio)."""

    _channel_semaphore = asyncio.Semaphore(8)

    @staticmethod
    def _is_matching_language(title: str, target_lang_code: str) -> bool:
        """Проверяет соответствие заголовка выбранному языку."""
        has_cyrillic = bool(re.search(r"[\u0400-\u04FF]", title))
        if target_lang_code == "en":
            # Если выбран английский, отбрасываем видео с русским текстом
            return not has_cyrillic
        elif target_lang_code == "ru":
            # В RU-поиске допускаются англоязычные названия фреймворков
            return True
        return True

    @staticmethod
    def _translate_query_to_target(query: str, target_lang_code: str) -> str:
        """Адаптирует поисковый запрос под язык YouTube."""
        clean = clean_search_keyword(query)
        if target_lang_code == "en" and re.search(r"[\u0400-\u04FF]", clean):
            t = (
                clean.replace("Нейросети", "AI Neural Networks")
                .replace("нейросети", "AI tools")
                .replace("Программирование", "Coding Programming")
                .replace("программирование", "software development")
                .replace("ИИ", "AI")
            )
            t = re.sub(r"[\u0400-\u04FF]+", "", t).strip(" ,;")
            return t if len(t) >= 3 else "AI coding programming tools"
        return clean

    @staticmethod
    def _viral_fields(v: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "transcript_status": "none",
            "transcript_sample": "",
            "comments_summary": "",
            "vps_score": None,
            "social_source_url": None,
            "thumbnail_url": v.get("thumbnail_url")
            or f"https://i.ytimg.com/vi/{v['video_id']}/hqdefault.jpg",
        }

    @classmethod
    async def _fetch_candidates_multisource(
        cls, query: str, lang_code: str
    ) -> List[Dict[str, Any]]:
        """Трёхуровневый поиск видео: Innertube -> ytscrape -> yt-dlp."""
        # 1. Tier-1: Innertube Direct Search
        raw_vids = await InnertubeClient.search_videos(query, max_results=40, language=lang_code)
        if raw_vids:
            return raw_vids

        # 2. Tier-2: ytscrape service
        if YtScrapeService.is_available():
            try:
                raw_vids = await YtScrapeService.search_videos(query, max_results=40, language=lang_code)
                if raw_vids:
                    return raw_vids
            except Exception:
                pass

        # 3. Tier-3: yt-dlp JSON search fallback
        try:
            cmd = [
                "yt-dlp",
                "--skip-download",
                "--dump-json",
                f"ytsearch25:{query}",
                "--no-warnings",
            ]
            res = await asyncio.to_thread(subprocess.run, cmd, capture_output=True, timeout=15.0)
            lines = res.stdout.decode("utf-8", errors="replace").splitlines() if res.stdout else []
            vids = []
            for line in lines:
                if not line.strip():
                    continue
                try:
                    d = json.loads(line)
                    v_id = d.get("id")
                    if v_id:
                        vids.append({
                            "video_id": v_id,
                            "title": d.get("title", ""),
                            "channel": d.get("uploader", "") or d.get("channel", ""),
                            "channel_id": d.get("channel_id", "") or d.get("uploader_id", ""),
                            "views": int(d.get("view_count") or 0),
                            "duration_sec": int(d.get("duration") or 0),
                            "is_short": 0 < int(d.get("duration") or 0) <= 180,
                            "published_at": d.get("upload_date", ""),
                            "url": f"https://youtu.be/{v_id}",
                            "thumbnail_url": d.get("thumbnail") or f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg",
                        })
                except Exception:
                    pass
            if vids:
                return vids
        except Exception:
            pass

        return []

    @classmethod
    async def search_viral_videos(
        cls,
        queries: List[str],
        days_back: int,
        min_subs: int,
        max_subs: int,
        min_ratio: float,
        api_key: str = "",
        language: str = "en",
        video_type: str = "all",
        on_candidate_found: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> List[Dict[str, Any]]:
        lang_code, _, _ = normalize_language_code(language)
        all_results = []
        max_hours = float(days_back * 24.0)
        seen_ids = set()

        # Адаптируем запросы под целевой язык
        adapted_queries = []
        for q in queries:
            t_q = cls._translate_query_to_target(q, lang_code)
            if t_q and t_q not in adapted_queries:
                adapted_queries.append(t_q)

        min_views_threshold = int(min_subs * min_ratio) if min_ratio >= 1.0 else 500

        for query in adapted_queries:
            raw_vids = await cls._fetch_candidates_multisource(query, lang_code)
            candidates = []
            for v in raw_vids:
                v_id = v["video_id"]
                if v_id in seen_ids:
                    continue

                # Языковой фильтр: отсекаем русские видео при поиске на английском
                if not cls._is_matching_language(v.get("title", ""), lang_code):
                    continue

                dur = v.get("duration_sec", 0)
                if video_type == "short" and not (0 < dur <= 180):
                    continue
                if video_type == "long" and dur <= 180 and dur > 0:
                    continue
                if v.get("views", 0) < min_views_threshold:
                    continue
                hours_alive = parse_published_to_hours(v.get("published_at", ""))
                if hours_alive > max_hours and days_back <= 7:
                    continue

                clean_ch = sanitize_channel_query(v.get("channel_id") or v.get("channel"))
                candidates.append((v, clean_ch or v["channel"], hours_alive))

            async def _process_candidate(c):
                v_item, clean_ch, hours_alive = c
                subs = 0
                if YtScrapeService.is_available() and clean_ch:
                    try:
                        async with cls._channel_semaphore:
                            ch_info = await YtScrapeService.get_channel_info(clean_ch, language=lang_code)
                            subs = ch_info.get("subs", 0)
                    except Exception:
                        subs = 0

                views = v_item.get("views", 0)
                if subs > 0:
                    if subs < min_subs or subs > max_subs:
                        return None
                    ratio = round(views / float(subs), 2)
                else:
                    # Эвристика для каналов со скрытыми подписчиками
                    ratio = round(min(5.0, max(1.2, views / 10000.0)), 2)

                if ratio < min_ratio and views < 10000:
                    return None

                res = {
                    "video_id": v_item["video_id"],
                    "title": v_item["title"],
                    "channel": v_item["channel"],
                    "channel_id": clean_ch,
                    "channel_url": f"https://www.youtube.com/@{clean_ch}",
                    "views": views,
                    "subs": subs or int(views / max(1.0, ratio)),
                    "ratio": ratio,
                    "vph": round(views / max(1.0, hours_alive)),
                    "url": v_item["url"],
                    "published_at": v_item.get("published_at", ""),
                    "keyword_found": query,
                    "duration_sec": v_item.get("duration_sec", 0),
                    "is_short": v_item.get("is_short", False),
                    **cls._viral_fields(v_item),
                }
                if on_candidate_found:
                    on_candidate_found(res)
                return res

            evaluated = await asyncio.gather(
                *[_process_candidate(c) for c in candidates[:20]], return_exceptions=True
            )
            for res in evaluated:
                if isinstance(res, dict) and res["video_id"] not in seen_ids:
                    seen_ids.add(res["video_id"])
                    all_results.append(res)
            if len(all_results) >= 16:
                break

        return all_results
