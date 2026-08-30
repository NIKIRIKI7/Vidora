"""Высокоскоростной прямой клиент к YouTube Innertube API.

Поддерживает поиск (без API-ключа), метаданные плеера, субтитры и прямые
аудиопотоки для byte-range нарезки. Ротация клиентских контекстов WEB/ANDROID/IOS.
"""

import re
from typing import Any, Dict, List, Optional

from app.infrastructure.youtube.circuit_cache import DeepTrendCircuitCache
from app.infrastructure.youtube.http_client import DeepTrendHTTPPool
from app.infrastructure.youtube.normalizer import (
    clean_search_keyword,
    normalize_language_code,
    parse_count,
    parse_duration_to_seconds,
)


class InnertubeClient:
    """Высокоскоростной клиент YouTube Innertube API: поиск, плеер, субтитры, аудио."""

    INNERTUBE_URL = "https://www.youtube.com/youtubei/v1"

    CLIENT_PROFILES = {
        "WEB": {
            "clientName": "WEB",
            "clientVersion": "2.20240825.01.00",
            "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
        },
        "ANDROID": {
            "clientName": "ANDROID",
            "clientVersion": "19.29.35",
            "androidSdkVersion": 30,
            "userAgent": "com.google.android.youtube/19.29.35 (Linux; U; Android 11) gzip",
        },
        "IOS": {
            "clientName": "IOS",
            "clientVersion": "19.29.1",
            "deviceModel": "iPhone14,5",
            "userAgent": "com.google.ios.youtube/19.29.1 (iPhone14,5; U; CPU iOS 16_6 like Mac OS X)",
        },
    }

    @classmethod
    def _build_context(cls, profile_key: str, lang: str = "en", region: str = "US") -> Dict[str, Any]:
        profile = cls.CLIENT_PROFILES[profile_key]
        context = {
            "client": {
                "hl": lang,
                "gl": region,
                "clientName": profile["clientName"],
                "clientVersion": profile["clientVersion"],
            }
        }
        if "androidSdkVersion" in profile:
            context["client"]["androidSdkVersion"] = profile["androidSdkVersion"]
        if "deviceModel" in profile:
            context["client"]["deviceModel"] = profile["deviceModel"]
        return context

    @classmethod
    async def search_videos(
        cls, query: str, max_results: int = 40, language: str = "en"
    ) -> List[Dict[str, Any]]:
        """Прямой HTTP/2 поиск по YouTube через Innertube (без API-ключа)."""
        clean_q = clean_search_keyword(query)
        if not clean_q:
            return []

        lang_code, region, _ = normalize_language_code(language)
        cache_key = f"innertube_search_{clean_q}_{lang_code}"
        cached = DeepTrendCircuitCache.get_l1(cache_key)
        if cached is not None:
            return cached

        client = await DeepTrendHTTPPool.get_client()
        payload = {
            "query": clean_q,
            "context": cls._build_context("WEB", lang=lang_code, region=region),
        }
        headers = {
            "User-Agent": cls.CLIENT_PROFILES["WEB"]["userAgent"],
            "Content-Type": "application/json",
        }

        results: List[Dict[str, Any]] = []
        try:
            res = await client.post(
                f"{cls.INNERTUBE_URL}/search", json=payload, headers=headers, timeout=5.0
            )
            if res.status_code == 200:
                data = res.json()
                sections = (
                    data.get("contents", {})
                    .get("twoColumnSearchResultsRenderer", {})
                    .get("primaryContents", {})
                    .get("sectionListRenderer", {})
                    .get("contents", [])
                )
                for sec in sections:
                    items = sec.get("itemSectionRenderer", {}).get("contents", [])
                    for item in items:
                        vr = item.get("videoRenderer")
                        if not vr:
                            continue
                        v_id = vr.get("videoId")
                        if not v_id:
                            continue

                        title_runs = vr.get("title", {}).get("runs", [])
                        title = "".join(r.get("text", "") for r in title_runs)
                        views_text = vr.get("viewCountText", {}).get("simpleText", "") or "".join(
                            r.get("text", "") for r in vr.get("viewCountText", {}).get("runs", [])
                        )
                        published_text = vr.get("publishedTimeText", {}).get("simpleText", "")
                        length_text = vr.get("lengthText", {}).get("simpleText", "")
                        owner_runs = vr.get("ownerText", {}).get("runs", [])
                        channel_title = owner_runs[0].get("text", "") if owner_runs else ""
                        channel_id = ""
                        if owner_runs and "navigationEndpoint" in owner_runs[0]:
                            channel_id = (
                                owner_runs[0]["navigationEndpoint"]
                                .get("browseEndpoint", {})
                                .get("browseId", "")
                            )

                        views = parse_count(views_text)
                        dur_sec = parse_duration_to_seconds(length_text)
                        thumb = f"https://i.ytimg.com/vi/{v_id}/hqdefault.jpg"

                        results.append({
                            "video_id": v_id,
                            "title": title,
                            "channel": channel_title,
                            "channel_id": channel_id or channel_title,
                            "views": views,
                            "duration_sec": dur_sec,
                            "is_short": 0 < dur_sec <= 180,
                            "published_at": published_text,
                            "url": f"https://youtu.be/{v_id}",
                            "thumbnail_url": thumb,
                        })
                        if len(results) >= max_results:
                            break
                    if len(results) >= max_results:
                        break
        except Exception:
            pass

        if results:
            DeepTrendCircuitCache.set_l1(cache_key, results, ttl=600.0)
        return results

    @classmethod
    async def get_player_data(cls, video_id: str) -> Optional[Dict[str, Any]]:
        """Метаданные плеера с каскадной ротацией клиентских контекстов."""
        cache_key = f"innertube_player_{video_id}"
        cached = DeepTrendCircuitCache.get_l2(cache_key)
        if cached is not None:
            return cached

        if not DeepTrendCircuitCache.is_service_available("innertube"):
            return None

        client = await DeepTrendHTTPPool.get_client()
        for profile_name, profile_data in cls.CLIENT_PROFILES.items():
            payload = {
                "videoId": video_id,
                "context": cls._build_context(profile_name),
            }
            headers = {
                "User-Agent": profile_data["userAgent"],
                "Content-Type": "application/json",
            }
            try:
                res = await client.post(
                    f"{cls.INNERTUBE_URL}/player", json=payload, headers=headers, timeout=3.5
                )
                if res.status_code == 200:
                    data = res.json()
                    playability = data.get("playabilityStatus", {}).get("status")
                    if playability == "OK":
                        DeepTrendCircuitCache.record_service_success("innertube")
                        DeepTrendCircuitCache.set_l2(cache_key, data, ttl=3600.0)
                        return data
                    elif playability in ("UNPLAYABLE", "LOGIN_REQUIRED"):
                        continue
                elif res.status_code in (403, 429):
                    continue
            except Exception:
                continue

        DeepTrendCircuitCache.record_service_failure("innertube", "Innertube profiles blocked or rate limited")
        return None

    @classmethod
    async def extract_fast_subtitles(
        cls, video_id: str, preferred_langs: Optional[List[str]] = None
    ) -> Optional[str]:
        """Tier-0: мгновенное извлечение официальных или ASR субтитров (0 GPU)."""
        langs = preferred_langs or ["ru", "en", "es"]
        player_data = await cls.get_player_data(video_id)
        if not player_data:
            return None

        captions = (
            player_data.get("captions", {})
            .get("playerCaptionsTracklistRenderer", {})
            .get("captionTracks", [])
        )
        if not captions:
            return None

        # Сортируем: сначала официальные субтитры на нужном языке, затем ASR
        selected_track = None
        for lang in langs:
            for track in captions:
                code = track.get("languageCode", "").lower()
                if code.startswith(lang) and track.get("kind") != "asr":
                    selected_track = track
                    break
            if selected_track:
                break

        if not selected_track:
            for lang in langs:
                for track in captions:
                    if track.get("languageCode", "").lower().startswith(lang):
                        selected_track = track
                        break
                if selected_track:
                    break

        if not selected_track:
            selected_track = captions[0]

        base_url = selected_track.get("baseUrl")
        if not base_url:
            return None

        client = await DeepTrendHTTPPool.get_client()
        try:
            sub_res = await client.get(f"{base_url}&fmt=json3", timeout=3.0)
            if sub_res.status_code == 200:
                json_sub = sub_res.json()
                lines = []
                for event in json_sub.get("events", []):
                    segs = event.get("segs", [])
                    text = "".join(s.get("utf8", "") for s in segs).strip()
                    if text and text != "\n":
                        lines.append(text)
                cleaned = " ".join(lines)
                if len(cleaned) > 50:
                    return re.sub(r"\s+", " ", cleaned).strip()
        except Exception:
            pass

        return None

    @classmethod
    async def extract_streaming_audio_url(cls, video_id: str) -> Optional[str]:
        """Прямой Googlevideo URL аудиопотока (Opus/WebM предпочтительно)."""
        player_data = await cls.get_player_data(video_id)
        if not player_data:
            return None

        streaming_data = player_data.get("streamingData", {})
        adaptive_formats = streaming_data.get("adaptiveFormats", [])
        audio_formats = [f for f in adaptive_formats if f.get("mimeType", "").startswith("audio/")]
        if not audio_formats:
            return None

        audio_formats.sort(key=lambda f: 0 if "webm" in f.get("mimeType", "") else 1)
        return audio_formats[0].get("url")
