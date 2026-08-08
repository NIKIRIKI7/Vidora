import re
import httpx
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
        published_after = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime('%Y-%m-%dT%H:%M:%SZ')
        
        region_map = {"ru": "RU", "en": "US", "es": "ES"}
        region = region_map.get(language, "US")

        all_results = []
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            for query in queries:
                print(f"[YT_SEARCHER] Ищем по запросу: '{query}' (Регион: {region})...")
                search_res = await client.get(f"{base_url}/search", params={
                    "part": "snippet",
                    "q": query,
                    "type": "video",
                    "publishedAfter": published_after,
                    "maxResults": 50,
                    "relevanceLanguage": language,
                    "regionCode": region,
                    "key": api_key,
                })
                
                search_data = search_res.json()
                if "items" not in search_data:
                    continue
                    
                video_ids = [item["id"]["videoId"] for item in search_data["items"]]
                channel_ids = list({item["snippet"]["channelId"] for item in search_data["items"]})
                
                if not video_ids:
                    continue

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
                    title = item["snippet"]["title"]
                    desc = item["snippet"]["description"]
                    
                    # === ЖЕСТКАЯ ПРОВЕРКА НА РЕЛЕВАНТНОСТЬ ===
                    # Отсекаем мусор (новости, приколы), который YouTube выдает не по теме.
                    # Требуем, чтобы хотя бы одно значимое слово из запроса было в заголовке или описании.
                    title_desc_lower = (title + " " + desc).lower()
                    clean_query = re.sub(r'[^\w\s]', '', query).lower()
                    query_words = [w for w in clean_query.split() if len(w) > 2]
                    
                    if query_words:
                        is_relevant = any(qw in title_desc_lower for qw in query_words)
                        if not is_relevant:
                            continue # Пропускаем видео, если оно не относится к запросу

                    v_stat = videos_data.get(v_id, {}).get("statistics", {})
                    c_stat = channels_data.get(c_id, {}).get("statistics", {})
                    
                    views = int(v_stat.get("viewCount", 0))
                    subs = int(c_stat.get("subscriberCount", 0))
                    
                    if subs == 0:
                        continue
                        
                    ratio = views / subs
                    
                    if min_subs <= subs <= max_subs and ratio >= min_ratio:
                        duration_sec = YouTubeSearcher._parse_duration(videos_data.get(v_id, {}).get("contentDetails", {}).get("duration", ""))
                        
                        if video_type == "short" and not (0 < duration_sec <= 180):
                            continue
                        if video_type == "long" and duration_sec <= 180:
                            continue

                        if not any(r['video_id'] == v_id for r in all_results):
                            all_results.append({
                                "video_id": v_id,
                                "title": title,
                                "channel": item["snippet"]["channelTitle"],
                                "views": views,
                                "subs": subs,
                                "ratio": round(ratio, 2),
                                "url": f"https://youtu.be/{v_id}",
                                "published_at": item["snippet"]["publishedAt"],
                                "keyword_found": query,
                                "duration_sec": duration_sec,
                                "is_short": 0 < duration_sec <= 180,
                            })

        print(f"[YT_SEARCHER] Найдено всего релевантных вирусных видео: {len(all_results)}")
        return sorted(all_results, key=lambda x: x["ratio"], reverse=True)