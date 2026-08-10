import re
import httpx
import statistics
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

class YouTubeSearcher:
    _DURATION_RE = re.compile(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?')

    @staticmethod
    def _parse_duration(iso: str) -> int:
        m = YouTubeSearcher._DURATION_RE.match(iso or "")
        if not m: return 0
        h, mi, s = (int(g) if g else 0 for g in m.groups())
        return h * 3600 + mi * 60 + s

    @staticmethod
    async def search_viral_videos(
        queries: List[str],
        days_back: int,
        min_subs: int,
        max_subs: int,
        min_ratio: float,
        api_key: str,
        language: str = "ru",
        video_type: str = "all"
    ) -> List[Dict[str, Any]]:
        if not api_key:
            raise ValueError("YOUTUBE_API_KEY не предоставлен.")

        base_url = "https://www.googleapis.com/youtube/v3"
        now_utc = datetime.now(timezone.utc)
        published_after = (now_utc - timedelta(days=days_back)).strftime('%Y-%m-%dT%H:%M:%SZ')
        
        region_map = {"ru": "RU", "en": "US", "es": "ES"}
        region = region_map.get(language, "US")

        all_results = []
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            for query in queries:
                print(f"[YT_SEARCHER] Ищем по запросу: '{query}' (Регион: {region})...")
                search_res = await client.get(f"{base_url}/search", params={
                    "part": "snippet", "q": query, "type": "video",
                    "publishedAfter": published_after, "maxResults": 50,
                    "relevanceLanguage": language, "regionCode": region, "key": api_key,
                })
                
                search_data = search_res.json()
                if "items" not in search_data: continue
                    
                video_ids = [item["id"]["videoId"] for item in search_data["items"]]
                channel_ids = list({item["snippet"]["channelId"] for item in search_data["items"]})
                if not video_ids: continue

                videos_res = await client.get(f"{base_url}/videos", params={
                    "part": "statistics,contentDetails", "id": ",".join(video_ids), "key": api_key,
                })
                videos_data = {item["id"]: item for item in videos_res.json().get("items", [])}

                channels_res = await client.get(f"{base_url}/channels", params={
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
                    if subs == 0: continue
                        
                    ratio = views / subs
                    
                    if min_subs <= subs <= max_subs and ratio >= min_ratio:
                        duration_sec = YouTubeSearcher._parse_duration(videos_data.get(v_id, {}).get("contentDetails", {}).get("duration", ""))
                        
                        if video_type == "short" and not (0 < duration_sec <= 180): continue
                        if video_type == "long" and duration_sec <= 180: continue

                        # Расчет VPH (Views Per Hour)
                        pub_str = item["snippet"]["publishedAt"]
                        pub_dt = datetime.strptime(pub_str, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                        hours_alive = max((now_utc - pub_dt).total_seconds() / 3600, 1.0)
                        vph = round(views / hours_alive)

                        if not any(r['video_id'] == v_id for r in all_results):
                            all_results.append({
                                "video_id": v_id,
                                "title": item["snippet"]["title"],
                                "channel": item["snippet"]["channelTitle"],
                                "views": views,
                                "subs": subs,
                                "ratio": round(ratio, 2),
                                "vph": vph,
                                "url": f"https://youtu.be/{v_id}",
                                "published_at": pub_str,
                                "keyword_found": query,
                                "duration_sec": duration_sec,
                                "is_short": 0 < duration_sec <= 180,
                            })

        print(f"[YT_SEARCHER] Найдено {len(all_results)} потенциальных вирусных видео")
        return sorted(all_results, key=lambda x: x["vph"], reverse=True) # Теперь сортируем по VPH!

    @staticmethod
    async def search_channel_outliers(
        channels: List[str], days_back: int, min_ratio: float,
        api_key: str, video_type: str = "all"
    ) -> List[Dict[str, Any]]:
        if not api_key:
            raise ValueError("YOUTUBE_API_KEY не предоставлен.")

        base_url = "https://www.googleapis.com/youtube/v3"
        now_utc = datetime.now(timezone.utc)
        cutoff_date = now_utc - timedelta(days=days_back)

        all_results = []
        async with httpx.AsyncClient(timeout=30.0) as client:
            for channel_query in channels:
                print(f"[YT_SEARCHER] Анализируем канал: '{channel_query}'...")
                search_res = await client.get(f"{base_url}/search", params={
                    "part": "snippet", "q": channel_query, "type": "channel", "maxResults": 1, "key": api_key
                })
                search_data = search_res.json()
                if not search_data.get("items"): continue
                channel_id = search_data["items"][0]["id"]["channelId"]

                channel_res = await client.get(f"{base_url}/channels", params={
                    "part": "contentDetails,statistics,snippet", "id": channel_id, "key": api_key
                })
                channel_data = channel_res.json()
                if not channel_data.get("items"): continue
                channel_info = channel_data["items"][0]
                uploads_id = channel_info["contentDetails"]["relatedPlaylists"]["uploads"]
                channel_subs = int(channel_info["statistics"].get("subscriberCount", 0))
                channel_title = channel_info["snippet"]["title"]

                playlist_res = await client.get(f"{base_url}/playlistItems", params={
                    "part": "snippet", "playlistId": uploads_id, "maxResults": 50, "key": api_key
                })
                playlist_data = playlist_res.json()
                if not playlist_data.get("items"): continue

                video_ids = [item["snippet"]["resourceId"]["videoId"] for item in playlist_data["items"]]
                videos_res = await client.get(f"{base_url}/videos", params={
                    "part": "statistics,contentDetails,snippet", "id": ",".join(video_ids), "key": api_key
                })
                videos_data = videos_res.json().get("items", [])

                valid_videos = []
                views_list = []
                for v in videos_data:
                    pub_dt = datetime.strptime(v["snippet"]["publishedAt"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
                    if pub_dt < cutoff_date: continue

                    views = int(v["statistics"].get("viewCount", 0))
                    duration_sec = YouTubeSearcher._parse_duration(v["contentDetails"].get("duration", ""))
                    if video_type == "short" and not (0 < duration_sec <= 180): continue
                    if video_type == "long" and duration_sec <= 180: continue

                    valid_videos.append({
                        "video_id": v["id"], "title": v["snippet"]["title"], "channel": channel_title,
                        "views": views, "subs": channel_subs, "url": f"https://youtu.be/{v['id']}",
                        "published_at": v["snippet"]["publishedAt"],
                        "duration_sec": duration_sec, "is_short": 0 < duration_sec <= 180,
                        "pub_dt": pub_dt
                    })
                    views_list.append(views)

                if not views_list: continue
                median_views = statistics.median(views_list) or 1.0

                for v in valid_videos:
                    ratio = v["views"] / median_views
                    if ratio >= min_ratio:
                        hours_alive = max((now_utc - v["pub_dt"]).total_seconds() / 3600, 1.0)
                        all_results.append({
                            "video_id": v["video_id"], "title": v["title"], "channel": v["channel"],
                            "views": v["views"], "subs": v["subs"], "ratio": round(ratio, 2),
                            "vph": round(v["views"] / hours_alive), "url": v["url"],
                            "published_at": v["published_at"], "keyword_found": f"Медиана канала: {int(median_views)}",
                            "duration_sec": v["duration_sec"], "is_short": v["is_short"],
                        })

        print(f"[YT_SEARCHER] Найдено {len(all_results)} аномалий")
        return sorted(all_results, key=lambda x: x["vph"], reverse=True)