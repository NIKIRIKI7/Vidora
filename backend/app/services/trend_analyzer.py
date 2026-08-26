import httpx
import asyncio
import re
from typing import List

from app.services.yt_normalizer import expand_ambiguous_keyword


class TrendAnalyzer:
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }

    @staticmethod
    async def get_youtube_suggests(query: str, lang: str = "ru", region: str = "RU") -> List[str]:
        url = "https://suggestqueries.google.com/complete/search"
        params = {"client": "firefox", "ds": "yt", "q": query, "hl": lang, "gl": region}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(url, params=params, headers=TrendAnalyzer.HEADERS)
                if res.status_code == 200:
                    data = res.json()
                    if len(data) > 1 and isinstance(data[1], list):
                        return [str(item) for item in data[1][:12]]
        except Exception as e:
            print(f"[TRENDS] Ошибка YouTube Suggests ({query}): {e}")
        return []

    @staticmethod
    async def get_google_suggests(query: str, lang: str = "ru", region: str = "RU") -> List[str]:
        url = "https://suggestqueries.google.com/complete/search"
        params = {"client": "firefox", "q": query, "hl": lang, "gl": region}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(url, params=params, headers=TrendAnalyzer.HEADERS)
                if res.status_code == 200:
                    data = res.json()
                    if len(data) > 1 and isinstance(data[1], list):
                        return [str(item) for item in data[1][:12]]
        except Exception as e:
            print(f"[TRENDS] Ошибка Google Suggests ({query}): {e}")
        return []

    @staticmethod
    async def get_yandex_suggests(query: str) -> List[str]:
        url = "https://suggest.yandex.ru/suggest-ya.cgi"
        params = {"part": query, "v": "4"}
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(url, params=params, headers=TrendAnalyzer.HEADERS)
                if res.status_code == 200:
                    data = res.json()
                    if len(data) > 1 and isinstance(data[1], list):
                        return [re.sub(r'<.*?>', '', str(item)).strip() for item in data[1][:12]]
        except Exception as e:
            print(f"[TRENDS] Ошибка Yandex Suggests ({query}): {e}")
        return []

    @classmethod
    async def get_expanded_queries(cls, base_topic: str, lang: str = "ru") -> List[str]:
        """
        Собирает живые трендовые саджесты со всех поисковиков + генерирует вариации.
        """
        region_map = {"ru": "RU", "en": "US", "es": "ES"}
        region = region_map.get(lang, "US")

        raw_tokens = [t.strip() for t in re.split(r'[,;/|]', base_topic) if t.strip()]
        sub_topics = [expand_ambiguous_keyword(t, lang) for t in raw_tokens if t]
        if not sub_topics:
            sub_topics = ["tech programming"] if lang == "en" else ["IT программирование"]

        tasks = []
        for topic in sub_topics[:3]:
            tasks.append(cls.get_youtube_suggests(topic, lang, region))
            tasks.append(cls.get_google_suggests(topic, lang, region))
            if lang == "ru":
                tasks.append(cls.get_yandex_suggests(topic))

        triggers = (
            ["обзор", "новости", "как", "2026"]
            if lang == "ru"
            else ["review", "news", "how to", "2026"]
        )
        for t in triggers[:2]:
            tasks.append(cls.get_youtube_suggests(f"{sub_topics[0]} {t}", lang, region))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        unique_trends = []
        seen = set()

        for r in results:
            if isinstance(r, list):
                for item in r:
                    cleaned = item.strip()
                    if "itzy" in cleaned.lower() and "itzy" not in base_topic.lower():
                        continue
                    if cleaned and cleaned.lower() not in seen:
                        seen.add(cleaned.lower())
                        unique_trends.append(cleaned)

        if not unique_trends:
            for topic in sub_topics:
                unique_trends.extend([
                    topic,
                    f"{topic} 2026",
                    f"{topic} {'обзор' if lang == 'ru' else 'review'}",
                ])

        return unique_trends[:25]
