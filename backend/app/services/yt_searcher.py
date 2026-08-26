import re
import httpx
import asyncio
import statistics
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any, Optional

from app.services.yt_normalizer import (
    parse_count, parse_duration_to_seconds, parse_published_to_hours,
    sanitize_channel_query, expand_ambiguous_keyword
)
from app.services.yt_scraper_service import YtScrapeService


class YouTubeSearcher:
    _DURATION_RE = re.compile(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?')
    BASE_URL = "https://www.googleapis.com/youtube/v3"

    @staticmethod
    def parse_duration(iso: str) -> int:
        return parse_duration_to_seconds(iso)

    @classmethod
    def _build_time_aware_queries(cls, base_queries: List[str], days_back: int, language: str) -> List[str]:
        expanded = []
        for raw_q in base_queries:
            q = expand_ambiguous_keyword(raw_q, language)
            expanded.append(q)
            if days_back <= 14:
                if language == "ru":
                    expanded.extend([
                        f"{q} на этой неделе",
                        f"{q} 2026",
                        f"{q} свежее",
                    ])
                else:
                    expanded.extend([
                        f"{q} this week",
                        f"{q} latest",
                        f"{q} 2026",
                    ])
        seen = set()
        res = []
        for item in expanded:
            if item.lower() not in seen:
                seen.add(item.lower())
                res.append(item)
        return res

    @classmethod
    async def search_viral_videos(
        cls,
        queries: List[str],
        days_back: int,
        min_subs: int,
        max_subs: int,
        min_ratio: float,
        api_key: str = "",
        language: str = "ru",
        video_type: str = "all"
    ) -> List[Dict[str, Any]]:
        all_results = []
        max_hours = float(days_back * 24.0)
        seen_ids = set()

        if YtScrapeService.is_available():
            try:
                search_queries = cls._build_time_aware_queries(queries, days_back, language)
                print(f"[YT-SEARCH] Поиск (Окно: {days_back} дн., ratio >= x{min_ratio}, subs: {min_subs}..{max_subs})...")

                for query in search_queries:
                    raw_vids = await YtScrapeService.search_videos(query, max_results=50, language=language)

                    for v in raw_vids:
                        v_id = v["video_id"]
                        if v_id in seen_ids:
                            continue

                        dur = v.get("duration_sec", 0)
                        if video_type == "short" and not (0 < dur <= 180):
                            continue
                        if video_type == "long" and dur <= 180 and dur > 0:
                            continue

                        pub_str = v.get("published_at", "")
                        hours_alive = parse_published_to_hours(pub_str)
                        if hours_alive > max_hours:
                            continue

                        raw_ch = v.get("channel_id") or v.get("channel")
                        clean_ch = sanitize_channel_query(raw_ch)
                        if not clean_ch:
                            continue

                        ch_info = await YtScrapeService.get_channel_info(clean_ch, language=language)
                        subs = ch_info.get("subs", 0)

                        if subs <= 0 or subs < min_subs or subs > max_subs:
                            continue

                        views = v.get("views", 0)
                        ratio = round(views / float(subs), 2)

                        if ratio >= min_ratio:
                            seen_ids.add(v_id)
                            all_results.append({
                                "video_id": v_id,
                                "title": v["title"],
                                "channel": ch_info.get("title") or v["channel"],
                                "views": views,
                                "subs": subs,
                                "ratio": ratio,
                                "vph": round(views / hours_alive),
                                "url": v["url"],
                                "published_at": pub_str,
                                "keyword_found": query,
                                "duration_sec": dur,
                                "is_short": v.get("is_short", False),
                            })

                        for cv in ch_info.get("videos", [])[:8]:
                            cv_id = cv["video_id"]
                            if cv_id in seen_ids:
                                continue
                            c_dur = cv.get("duration_sec", 0)
                            if video_type == "short" and not (0 < c_dur <= 180):
                                continue
                            if video_type == "long" and c_dur <= 180 and c_dur > 0:
                                continue

                            c_pub_str = cv.get("published_at", "")
                            c_hours = parse_published_to_hours(c_pub_str)
                            if c_hours > max_hours:
                                continue

                            c_views = cv.get("views", 0)
                            c_ratio = round(c_views / float(subs), 2)

                            if c_ratio >= min_ratio:
                                seen_ids.add(cv_id)
                                all_results.append({
                                    "video_id": cv_id,
                                    "title": cv["title"],
                                    "channel": ch_info.get("title") or v["channel"],
                                    "views": c_views,
                                    "subs": subs,
                                    "ratio": c_ratio,
                                    "vph": round(c_views / c_hours),
                                    "url": cv["url"],
                                    "published_at": c_pub_str,
                                    "keyword_found": f"Релизы канала {ch_info.get('title')}",
                                    "duration_sec": c_dur,
                                    "is_short": cv.get("is_short", False),
                                })

                    if len(all_results) >= 12:
                        break

                if all_results:
                    return sorted(all_results, key=lambda x: x["vph"], reverse=True)
            except Exception as e:
                print(f"[YT-SEARCH] Сбой ytscrape: {e}")

        if api_key:
            return await cls._search_viral_videos_official_api(
                queries=queries, days_back=days_back, min_subs=min_subs,
                max_subs=max_subs, min_ratio=min_ratio, api_key=api_key,
                language=language, video_type=video_type
            )

        return sorted(all_results, key=lambda x: x["vph"], reverse=True)

    @classmethod
    async def _search_viral_videos_official_api(
        cls,
        queries: List[str],
        days_back: int,
        min_subs: int,
        max_subs: int,
        min_ratio: float,
        api_key: str,
        language: str = "ru",
        video_type: str = "all"
    ) -> List[Dict[str, Any]]:
        now_utc = datetime.now(timezone.utc)
        published_after = (now_utc - timedelta(days=days_back)).strftime('%Y-%m-%dT%H:%M:%SZ')
        max_hours = float(days_back * 24.0)
        region_map = {"ru": "RU", "en": "US", "es": "ES"}
        region = region_map.get(language, "US")
        all_results = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            for query in queries:
                try:
                    search_res = await client.get(f"{cls.BASE_URL}/search", params={
                        "part": "snippet", "q": query, "type": "video",
                        "publishedAfter": published_after, "maxResults": 50,
                        "order": "date",
                        "relevanceLanguage": language, "regionCode": region, "key": api_key,
                    })
                    search_data = search_res.json()
                    if "items" not in search_data:
                        continue

                    video_ids = [item["id"]["videoId"] for item in search_data["items"]]
                    channel_ids = list({item["snippet"]["channelId"] for item in search_data["items"]})
                    if not video_ids:
                        continue

                    videos_res = await client.get(f"{cls.BASE_URL}/videos", params={
                        "part": "statistics,contentDetails", "id": ",".join(video_ids), "key": api_key,
                    })
                    videos_data = {item["id"]: item for item in videos_res.json().get("items", [])}

                    channels_res = await client.get(f"{cls.BASE_URL}/channels", params={
                        "part": "statistics", "id": ",".join(channel_ids), "key": api_key,
                    })
                    channels_data = {item["id"]: item for item in channels_res.json().get("items", [])}

                    for item in search_data["items"]:
                        v_id = item["id"]["videoId"]
                        c_id = item["snippet"]["channelId"]
                        v_stat = videos_data.get(v_id, {}).get("statistics", {})
                        c_stat = channels_data.get(c_id, {}).get("statistics", {})

                        views = int(v_stat.get("viewCount", 0))
                        subs = int(c_stat.get("subscriberCount", 0))
                        if subs <= 0 or subs < min_subs or subs > max_subs:
                            continue

                        ratio = round(views / float(subs), 2)
                        if ratio < min_ratio:
                            continue

                        duration_sec = cls.parse_duration(videos_data.get(v_id, {}).get("contentDetails", {}).get("duration", ""))
                        if video_type == "short" and not (0 < duration_sec <= 180):
                            continue
                        if video_type == "long" and duration_sec <= 180 and duration_sec > 0:
                            continue

                        pub_str = item["snippet"]["publishedAt"]
                        hours_alive = parse_published_to_hours(pub_str)
                        if hours_alive > max_hours:
                            continue

                        vph = round(views / hours_alive)

                        if not any(r['video_id'] == v_id for r in all_results):
                            all_results.append({
                                "video_id": v_id,
                                "title": item["snippet"]["title"],
                                "channel": item["snippet"]["channelTitle"],
                                "views": views,
                                "subs": subs,
                                "ratio": ratio,
                                "vph": vph,
                                "url": f"https://youtu.be/{v_id}",
                                "published_at": pub_str,
                                "keyword_found": query,
                                "duration_sec": duration_sec,
                                "is_short": 0 < duration_sec <= 180,
                            })
                except Exception:
                    pass

        return sorted(all_results, key=lambda x: x["vph"], reverse=True)

    @classmethod
    async def search_channel_outliers(
        cls,
        channels: List[str],
        days_back: int,
        min_ratio: float,
        api_key: str = "",
        video_type: str = "all"
    ) -> List[Dict[str, Any]]:
        all_results = []
        max_hours = float(days_back * 24.0)

        if YtScrapeService.is_available():
            try:
                for channel_query in channels:
                    clean_ch = sanitize_channel_query(channel_query)
                    if not clean_ch:
                        continue

                    ch_info = await YtScrapeService.get_channel_info(clean_ch)
                    videos = ch_info.get("videos", [])
                    if not videos:
                        continue

                    fresh_videos = []
                    for v in videos:
                        hours_alive = parse_published_to_hours(v.get("published_at", ""))
                        if hours_alive <= max_hours:
                            fresh_videos.append({**v, "hours_alive": hours_alive})

                    views_list = [v["views"] for v in videos if v["views"] > 0]
                    if not views_list or not fresh_videos:
                        continue

                    median_views = statistics.median(views_list) or 1.0
                    for v in fresh_videos:
                        dur = v.get("duration_sec", 0)
                        if video_type == "short" and not (0 < dur <= 180):
                            continue
                        if video_type == "long" and dur <= 180 and dur > 0:
                            continue

                        ratio = round(v["views"] / median_views, 2)
                        if ratio >= min_ratio:
                            all_results.append({
                                "video_id": v["video_id"],
                                "title": v["title"],
                                "channel": ch_info.get("title") or clean_ch,
                                "views": v["views"],
                                "subs": ch_info.get("subs", 0),
                                "ratio": ratio,
                                "vph": round(v["views"] / v["hours_alive"]),
                                "url": v["url"],
                                "published_at": v.get("published_at", ""),
                                "keyword_found": f"Медиана канала: {int(median_views)}",
                                "duration_sec": dur,
                                "is_short": v.get("is_short", False),
                            })

                if all_results:
                    return sorted(all_results, key=lambda x: x["vph"], reverse=True)
            except Exception as e:
                print(f"[YT-OUTLIERS] Ошибка ytscrape: {e}")

        if api_key:
            return await cls._search_channel_outliers_official_api(
                channels=channels, days_back=days_back, min_ratio=min_ratio,
                api_key=api_key, video_type=video_type
            )

        return sorted(all_results, key=lambda x: x["vph"], reverse=True)

    @classmethod
    async def _search_channel_outliers_official_api(
        cls,
        channels: List[str],
        days_back: int,
        min_ratio: float,
        api_key: str,
        video_type: str = "all"
    ) -> List[Dict[str, Any]]:
        now_utc = datetime.now(timezone.utc)
        cutoff_date = now_utc - timedelta(days=days_back)
        all_results = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            for channel_query in channels:
                try:
                    search_res = await client.get(f"{cls.BASE_URL}/search", params={
                        "part": "snippet", "q": channel_query, "type": "channel", "maxResults": 1, "key": api_key
                    })
                    search_data = search_res.json()
                    if not search_data.get("items"):
                        continue

                    channel_id = search_data["items"][0]["id"]["channelId"]
                    channel_res = await client.get(f"{cls.BASE_URL}/channels", params={
                        "part": "contentDetails,statistics,snippet", "id": channel_id, "key": api_key
                    })
                    channel_data = channel_res.json()
                    if not channel_data.get("items"):
                        continue

                    channel_info = channel_data["items"][0]
                    uploads_id = channel_info["contentDetails"]["relatedPlaylists"]["uploads"]
                    channel_subs = int(channel_info["statistics"].get("subscriberCount", 0))
                    channel_title = channel_info["snippet"]["title"]

                    playlist_res = await client.get(f"{cls.BASE_URL}/playlistItems", params={
                        "part": "snippet", "playlistId": uploads_id, "maxResults": 50, "key": api_key
                    })
                    playlist_data = playlist_res.json()
                    if not playlist_data.get("items"):
                        continue

                    video_ids = [item["snippet"]["resourceId"]["videoId"] for item in playlist_data["items"]]
                    videos_res = await client.get(f"{cls.BASE_URL}/videos", params={
                        "part": "statistics,contentDetails,snippet", "id": ",".join(video_ids), "key": api_key
                    })
                    videos_data = videos_res.json().get("items", [])

                    valid_videos = []
                    views_list = []
                    for v in videos_data:
                        pub_dt = datetime.strptime(v["snippet"]["publishedAt"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        if pub_dt < cutoff_date:
                            continue
                        views = int(v["statistics"].get("viewCount", 0))
                        duration_sec = cls.parse_duration(v["contentDetails"].get("duration", ""))
                        if video_type == "short" and not (0 < duration_sec <= 180):
                            continue
                        if video_type == "long" and duration_sec <= 180 and duration_sec > 0:
                            continue

                        valid_videos.append({
                            "video_id": v["id"], "title": v["snippet"]["title"], "channel": channel_title,
                            "views": views, "subs": channel_subs, "url": f"https://youtu.be/{v['id']}",
                            "published_at": v["snippet"]["publishedAt"],
                            "duration_sec": duration_sec, "is_short": 0 < duration_sec <= 180,
                            "pub_dt": pub_dt
                        })
                        views_list.append(views)

                    if not views_list or not valid_videos:
                        continue

                    median_views = statistics.median(views_list) or 1.0
                    for v in valid_videos:
                        ratio = round(v["views"] / median_views, 2)
                        if ratio >= min_ratio:
                            hours_alive = max((now_utc - v["pub_dt"]).total_seconds() / 3600, 1.0)
                            all_results.append({
                                "video_id": v["video_id"], "title": v["title"], "channel": v["channel"],
                                "views": v["views"], "subs": v["subs"], "ratio": ratio,
                                "vph": round(v["views"] / hours_alive), "url": v["url"],
                                "published_at": v["published_at"], "keyword_found": f"Медиана канала: {int(median_views)}",
                                "duration_sec": v["duration_sec"], "is_short": v["is_short"],
                            })
                except Exception:
                    pass

        return sorted(all_results, key=lambda x: x["vph"], reverse=True)
