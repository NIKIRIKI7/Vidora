import httpx
import json

class TrendAnalyzer:
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    @staticmethod
    async def get_youtube_suggests(query: str, lang: str = "ru", region: str = "US") -> list[str]:
        """Получает горячие запросы из поиска YouTube"""
        url = "http://suggestqueries.google.com/complete/search"
        params = {"client": "firefox", "ds": "yt", "q": query, "hl": lang, "gl": region}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, params=params, headers=TrendAnalyzer.HEADERS)
                if res.status_code == 200:
                    data = res.json()
                    if len(data) > 1 and isinstance(data[1], list):
                        return data[1][:10]
        except Exception as e:
            print(f"[TRENDS] Ошибка YouTube Suggests: {e}")
        return []

    @staticmethod
    async def get_google_suggests(query: str, lang: str = "ru", region: str = "US") -> list[str]:
        """Получает горячие запросы из поиска Google"""
        url = "http://suggestqueries.google.com/complete/search"
        params = {"client": "firefox", "q": query, "hl": lang, "gl": region}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, params=params, headers=TrendAnalyzer.HEADERS)
                if res.status_code == 200:
                    data = res.json()
                    if len(data) > 1 and isinstance(data[1], list):
                        return data[1][:10]
        except Exception as e:
            print(f"[TRENDS] Ошибка Google Suggests: {e}")
        return []

    @staticmethod
    async def get_yandex_suggests(query: str) -> list[str]:
        """Получает горячие запросы из поиска Яндекса"""
        url = "https://yandex.ru/suggest/suggest-ya.cgi"
        params = {"part": query, "v": "4"}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.get(url, params=params, headers=TrendAnalyzer.HEADERS)
                if res.status_code == 200:
                    data = res.json()
                    if len(data) > 1 and isinstance(data[1], list):
                        # Яндекс иногда возвращает жирный текст в тегах <b>, очищаем его
                        return [str(item).replace("<b>", "").replace("</b>", "") for item in data[1][:10]]
        except Exception as e:
            print(f"[TRENDS] Ошибка Yandex Suggests: {e}")
        return []

    @staticmethod
    async def get_combined_trends(query: str, lang: str = "ru") -> dict:
        """Собирает тренды со всех площадок"""
        region_map = {"ru": "RU", "en": "US", "es": "ES"}
        region = region_map.get(lang, "US")
        
        # Запрашиваем всё параллельно для скорости
        import asyncio
        yt_task = TrendAnalyzer.get_youtube_suggests(query, lang, region)
        gg_task = TrendAnalyzer.get_google_suggests(query, lang, region)
        ya_task = TrendAnalyzer.get_yandex_suggests(query) if lang == "ru" else asyncio.sleep(0)
        
        yt, gg, ya = await asyncio.gather(yt_task, gg_task, ya_task)
        
        return {
            "youtube": yt,
            "google": gg,
            "yandex": ya if ya else []
        }