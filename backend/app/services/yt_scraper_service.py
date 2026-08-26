import asyncio
import time
from typing import Any, Dict, List, Optional

from app.services.yt_normalizer import (
    parse_count, parse_duration_to_seconds, parse_published_to_hours,
    extract_video_id, sanitize_channel_query
)


class YtScrapeService:
    _cache: Dict[str, tuple] = {}
    _cache_ttl = 1800  # 30 минут
    _semaphore = asyncio.Semaphore(3)  # Снижаем параллелизм для стабильности TCP
    _clients: Dict[str, Any] = {}

    @classmethod
    def is_available(cls) -> bool:
        try:
            import ytscrape  # noqa: F401
            return True
        except ImportError:
            return False

    @classmethod
    def _get_client(cls, language: str = "ru", region: str = "RU"):
        key = f"{language}_{region}"
        if key not in cls._clients:
            from ytscrape import YouTube
            cls._clients[key] = YouTube(language=language, region=region)
        return cls._clients[key]

    @classmethod
    def _reset_client(cls, language: str = "ru", region: str = "RU"):
        key = f"{language}_{region}"
        if key in cls._clients:
            try:
                cls._clients[key].close()
            except Exception:
                pass
            del cls._clients[key]

    @classmethod
    def _get_cached(cls, key: str) -> Optional[Any]:
        if key in cls._cache:
            ts, data = cls._cache[key]
            if time.time() - ts < cls._cache_ttl:
                return data
            del cls._cache[key]
        return None

    @classmethod
    def _set_cached(cls, key: str, data: Any):
        cls._cache[key] = (time.time(), data)

    @classmethod
    def search_videos_sync(cls, query: str, max_results: int = 60, language: str = "ru") -> List[Dict[str, Any]]:
        cache_key = f"search_{query}_{max_results}_{language}"
        cached = cls._get_cached(cache_key)
        if cached is not None:
            return cached

        results = []
        region = "RU" if language == "ru" else "US"

        for attempt in range(2):
            try:
                from ytscrape import SearchFilter
                yt = cls._get_client(language=language, region=region)
                time.sleep(0.15)  # Защитная задержка от 10054

                count = 0
                for item in yt.search(query, filter=SearchFilter.VIDEOS, max_results=max_results):
                    v_id = getattr(item, 'id', None) or getattr(item, 'video_id', '')
                    if not v_id:
                        continue

                    title = getattr(item, 'title', '')
                    raw_channel = getattr(item, 'channel', '') or getattr(item, 'channel_title', '')
                    views = parse_count(getattr(item, 'views', None) or getattr(item, 'view_count', None) or getattr(item, 'view_count_text', 0))
                    duration_sec = parse_duration_to_seconds(getattr(item, 'duration', None) or getattr(item, 'length_seconds', None) or getattr(item, 'duration_seconds', 0))
                    pub_str = str(getattr(item, 'published_at', '') or getattr(item, 'published', '') or getattr(item, 'published_text', '') or '')
                    thumb = getattr(item, 'thumbnail_url', '') or getattr(item, 'thumbnail', '') or f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg"

                    results.append({
                        "video_id": v_id,
                        "title": title,
                        "channel": raw_channel,
                        "channel_id": getattr(item, 'channel_id', '') or raw_channel,
                        "views": views,
                        "duration_sec": duration_sec,
                        "is_short": 0 < duration_sec <= 180,
                        "published_at": pub_str,
                        "url": f"https://youtu.be/{v_id}",
                        "thumbnail_url": thumb,
                    })
                    count += 1
                    if count >= max_results:
                        break
                break
            except Exception as e:
                cls._reset_client(language=language, region=region)
                if attempt == 1:
                    print(f"[ytscrape] Поиск '{query}' временно недоступен ({e})")

        cls._set_cached(cache_key, results)
        return results

    @classmethod
    async def search_videos(cls, query: str, max_results: int = 60, language: str = "ru") -> List[Dict[str, Any]]:
        async with cls._semaphore:
            return await asyncio.to_thread(cls.search_videos_sync, query, max_results, language)

    @classmethod
    def get_channel_info_sync(cls, channel_id_or_handle: str, language: str = "ru") -> Dict[str, Any]:
        clean_target = sanitize_channel_query(channel_id_or_handle)
        if not clean_target:
            return {"subs": 0, "title": "", "description": "", "videos": []}

        cache_key = f"channel_{clean_target}_{language}"
        cached = cls._get_cached(cache_key)
        if cached is not None:
            return cached

        res = {"subs": 0, "title": clean_target, "description": "", "videos": []}
        region = "RU" if language == "ru" else "US"

        for attempt in range(2):
            try:
                yt = cls._get_client(language=language, region=region)
                time.sleep(0.12)  # Защита от ConnectionReset

                ch = yt.channel(clean_target)
                if ch:
                    subs_raw = getattr(ch, 'subscriber_count', None) or getattr(ch, 'subscribers', None) or getattr(ch, 'subscriber_count_text', 0)
                    res["subs"] = parse_count(subs_raw)
                    res["title"] = getattr(ch, 'title', '') or getattr(ch, 'name', '') or clean_target
                    res["description"] = getattr(ch, 'description', '') or ''

                    ch_vids = getattr(ch, 'videos', None)
                    if ch_vids:
                        for v in list(ch_vids)[:25]:
                            vid_id = getattr(v, 'id', '') or getattr(v, 'video_id', '')
                            if vid_id:
                                dur = parse_duration_to_seconds(getattr(v, 'duration', 0) or getattr(v, 'length_seconds', 0))
                                res["videos"].append({
                                    "video_id": vid_id,
                                    "title": getattr(v, 'title', ''),
                                    "views": parse_count(getattr(v, 'views', 0) or getattr(v, 'view_count', 0)),
                                    "duration_sec": dur,
                                    "is_short": 0 < dur <= 180,
                                    "published_at": str(getattr(v, 'published_at', '') or getattr(v, 'published', '') or getattr(v, 'published_text', '')),
                                    "url": f"https://youtu.be/{vid_id}",
                                })
                break
            except Exception as e:
                print(f"[ytscrape WARN] Channel info error for '{channel_id_or_handle}': {e}")
                cls._reset_client(language=language, region=region)
                break

        cls._set_cached(cache_key, res)
        return res

    @classmethod
    async def get_channel_info(cls, channel_id_or_handle: str, language: str = "ru") -> Dict[str, Any]:
        async with cls._semaphore:
            return await asyncio.to_thread(cls.get_channel_info_sync, channel_id_or_handle, language)

    @classmethod
    def get_video_info_sync(cls, video_id: str) -> Dict[str, Any]:
        cache_key = f"videoinfo_{video_id}"
        cached = cls._get_cached(cache_key)
        if cached is not None:
            return cached

        info = {}
        try:
            yt = cls._get_client()
            time.sleep(0.1)
            d = yt.video(video_id)
            info = {
                "video_id": getattr(d, 'video_id', video_id),
                "title": getattr(d, 'title', '') or '',
                "channel": getattr(d, 'channel', '') or '',
                "view_count": getattr(d, 'views', 0) or 0,
                "duration": getattr(d, 'length_seconds', 0) or 0,
            }
        except Exception as e:
            print(f"[ytscrape WARN] Video info error for {video_id}: {e}")

        cls._set_cached(cache_key, info)
        return info

    @classmethod
    async def get_video_info(cls, video_id: str) -> Dict[str, Any]:
        async with cls._semaphore:
            return await asyncio.to_thread(cls.get_video_info_sync, video_id)

    @classmethod
    def get_comments_sync(cls, video_id: str, max_comments: int = 20) -> List[Dict[str, Any]]:
        cache_key = f"comments_{video_id}_{max_comments}"
        cached = cls._get_cached(cache_key)
        if cached is not None:
            return cached

        comments = []
        try:
            from ytscrape import CommentSort
            yt = cls._get_client()
            time.sleep(0.1)
            raw_comments = yt.comments(video_id, include_replies=False, sort=CommentSort.TOP)
            for c in raw_comments:
                text = getattr(c, 'text', '') or getattr(c, 'content', '') or ''
                likes = parse_count(getattr(c, 'like_count', 0) or getattr(c, 'likes', 0))
                if text.strip():
                    comments.append({
                        "text": text.strip(),
                        "author": getattr(c, 'author', '') or 'User',
                        "likes": likes,
                    })
                if len(comments) >= max_comments:
                    break
        except Exception as e:
            print(f"[ytscrape WARN] Comments fetch error for {video_id}: {e}")

        cls._set_cached(cache_key, comments)
        return comments

    @classmethod
    async def get_comments(cls, video_id: str, max_comments: int = 20) -> List[Dict[str, Any]]:
        async with cls._semaphore:
            return await asyncio.to_thread(cls.get_comments_sync, video_id, max_comments)

    @classmethod
    def get_transcript_sync(cls, video_id: str, languages: Optional[List[str]] = None) -> str:
        langs = languages or ["ru", "en", "es"]
        cache_key = f"transcript_{video_id}_{','.join(langs)}"
        cached = cls._get_cached(cache_key)
        if cached is not None:
            return cached

        transcript_text = ""
        try:
            yt = cls._get_client()
            time.sleep(0.1)
            t_obj = yt.transcript(video_id, languages=langs)
            if t_obj:
                if isinstance(t_obj, str):
                    transcript_text = t_obj
                elif hasattr(t_obj, 'text'):
                    transcript_text = t_obj.text
                elif isinstance(t_obj, list):
                    parts = []
                    for segment in t_obj:
                        seg_text = getattr(segment, 'text', '') if not isinstance(segment, dict) else segment.get('text', '')
                        if seg_text:
                            parts.append(seg_text)
                    transcript_text = " ".join(parts)
        except Exception as e:
            print(f"[ytscrape WARN] Transcript error for {video_id}: {e}")

        transcript_text = transcript_text.strip()
        cls._set_cached(cache_key, transcript_text)
        return transcript_text

    @classmethod
    async def get_transcript(cls, video_id: str, languages: Optional[List[str]] = None) -> str:
        async with cls._semaphore:
            return await asyncio.to_thread(cls.get_transcript_sync, video_id, languages)
