"""Параллельный сбор ранних сигналов: Reddit, Habr, Google Trends, DuckDuckGo + HN/GitHub.

Все сетевые вызовы идут через единый DeepTrendHTTPPool (HTTP/2 Keep-Alive) —
одно соединение переиспользуется между источниками, без TLS handshake на каждый запрос.
"""

import asyncio
import re
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Any, Dict, List

import httpx

from app.domain.schemas.youtube import EarlySignalItem
from app.infrastructure.youtube.circuit_cache import DeepTrendCircuitCache
from app.infrastructure.youtube.http_client import DeepTrendHTTPPool
from app.infrastructure.youtube.it_signal_ingestor import GitHubTrendingIngestor, HackerNewsIngestor
from app.infrastructure.youtube.normalizer import normalize_language_code, parse_published_to_hours
from app.infrastructure.youtube.reddit_ingestor import RedditScraperEngine
from app.infrastructure.youtube.scoring import cluster_and_rank_signals


class RedditIngestor:
    """Адаптер сбора ранних сигналов Reddit через RSS-фиды профильных сабреддитов.

    Пустые результаты НЕ кэшируются (иначе при временной блокировке список [] жил бы
    в L1 10 минут и вытеснял Reddit из выдачи).
    """

    @classmethod
    async def fetch_signals(
        cls, query: str, lang: str = "ru", limit: int = 15
    ) -> List[Dict[str, Any]]:
        lang_code, _, _ = normalize_language_code(lang)
        cache_key = f"reddit_signals_v3_{query.lower()}_{lang_code}"
        cached = DeepTrendCircuitCache.get_l1(cache_key)
        if cached is not None and len(cached) > 0:
            return cached

        results = await RedditScraperEngine.fetch_signals(query, lang=lang_code, limit=limit)
        if results:
            DeepTrendCircuitCache.set_l1(cache_key, results, ttl=600.0)
            DeepTrendCircuitCache.record_service_success("reddit")
        return results


class HabrIngestor:
    @classmethod
    async def fetch_signals(cls, query: str, limit: int = 15) -> List[Dict[str, Any]]:
        if not DeepTrendCircuitCache.is_service_available("habr"):
            return []
        cached = DeepTrendCircuitCache.get_l1(f"habr_{query}")
        if cached is not None:
            return cached

        results: List[Dict[str, Any]] = []
        urls = ["https://habr.com/ru/rss/best/weekly/", "https://habr.com/ru/rss/hubs/all/"]

        client = await DeepTrendHTTPPool.get_client()
        for url in urls:
            try:
                res = await client.get(url)
                if res.status_code != 200:
                    continue
                DeepTrendCircuitCache.record_service_success("habr")
                try:
                    channel = ET.fromstring(res.text).find("channel")
                except ET.ParseError:
                    continue
                if channel is None:
                    continue
                for item in channel.findall("item")[:limit]:
                    title_el, link_el, pub_el, desc_el = (item.find(t) for t in ("title", "link", "pubDate", "description"))
                    title = (title_el.text or "").strip() if title_el is not None else ""
                    if not title:
                        continue
                    link = link_el.text.strip() if link_el is not None and link_el.text else ""
                    pub_str = pub_el.text.strip() if pub_el is not None and pub_el.text else ""
                    desc = (desc_el.text or "") if desc_el is not None else ""
                    bookmarks_m = re.search(r"(\d+)\s*(?:заклад|сохран|fav)", desc, re.I)
                    comments_m = re.search(r"(\d+)\s*(?:коммент|отзыв)", desc, re.I)
                    results.append({
                        "title": title, "query": query, "platform": "habr", "url": link,
                        "upvotes": 25, "comments": int(comments_m.group(1)) if comments_m else 20,
                        "bookmarks": int(bookmarks_m.group(1)) if bookmarks_m else 35,
                        "age_hours": parse_published_to_hours(pub_str),
                        "demand_score": 75.0, "breakout": bool(bookmarks_m and int(bookmarks_m.group(1)) > 80),
                    })
            except Exception as e:
                DeepTrendCircuitCache.record_service_failure("habr", str(e))

        DeepTrendCircuitCache.set_l1(f"habr_{query}", results)
        return results


class GoogleTrendsIngestor:
    @classmethod
    async def fetch_autocomplete_matrix(cls, query: str, lang: str = "ru", region: str = "RU") -> List[Dict[str, Any]]:
        cached = DeepTrendCircuitCache.get_l1(f"matrix_{query}_{lang}")
        if cached is not None:
            return cached

        results: List[Dict[str, Any]] = []
        cur_year = datetime.now().year
        suffixes = ["", " vs", f" {cur_year}", " обзор", " как сделать", " туториал", " guide", " latest"]

        client = await DeepTrendHTTPPool.get_client()
        tasks = []
        for sfx in suffixes[:4]:
            sub_q = f"{query}{sfx}".strip()
            tasks.append(client.get("https://suggestqueries.google.com/complete/search",
                                    params={"client": "firefox", "ds": "yt", "q": sub_q, "hl": lang, "gl": region}))
            tasks.append(client.get("https://suggestqueries.google.com/complete/search",
                                    params={"client": "firefox", "q": sub_q, "hl": lang, "gl": region}))
        responses = await asyncio.gather(*tasks, return_exceptions=True)
        for r in responses:
            if isinstance(r, httpx.Response) and r.status_code == 200:
                try:
                    data = r.json()
                    if len(data) > 1 and isinstance(data[1], list):
                        for idx, item in enumerate(data[1][:8]):
                            val = str(item).strip()
                            if not val:
                                continue
                            results.append({
                                "title": val, "query": val, "platform": "trends",
                                "url": f"https://trends.google.com/trends/explore?q={urllib.parse.quote_plus(val)}",
                                "upvotes": 50, "comments": 15, "bookmarks": 10,
                                "age_hours": 12.0, "demand_score": max(55.0, 95.0 - (idx * 5.0)),
                                "breakout": idx == 0 and str(cur_year) in val,
                            })
                except Exception:
                    pass

        DeepTrendCircuitCache.set_l1(f"matrix_{query}_{lang}", results)
        return results


class DuckDuckGoIngestor:
    @classmethod
    async def fetch_lsi_suggestions(cls, query: str) -> List[Dict[str, Any]]:
        cached = DeepTrendCircuitCache.get_l1(f"ddg_{query}")
        if cached is not None:
            return cached

        results: List[Dict[str, Any]] = []
        try:
            client = await DeepTrendHTTPPool.get_client()
            res = await client.get("https://duckduckgo.com/ac/", params={"q": query, "type": "list"})
            if res.status_code == 200:
                data = res.json()
                if len(data) > 1 and isinstance(data[1], list):
                    for idx, item in enumerate(data[1][:6]):
                        val = str(item).strip()
                        if val:
                            results.append({
                                "title": val, "query": val, "platform": "duckduckgo",
                                "url": f"https://duckduckgo.com/?q={urllib.parse.quote_plus(val)}",
                                "upvotes": 20, "comments": 5, "bookmarks": 5,
                                "age_hours": 18.0, "demand_score": max(45.0, 75.0 - (idx * 4.0)),
                                "breakout": False,
                            })
        except Exception:
            pass

        DeepTrendCircuitCache.set_l1(f"ddg_{query}", results)
        return results


class SignalIngestor:
    """Параллельный оркестратор 6 источников ранних сигналов через единый HTTP/2 пул:
    Reddit + Google Trends + DuckDuckGo + HackerNews + GitHub (+ Habr для RU)."""

    @classmethod
    async def collect_early_signals(cls, query: str, lang: str = "ru") -> List[EarlySignalItem]:
        region = "RU" if lang == "ru" else "US"
        tasks = [
            RedditIngestor.fetch_signals(query, lang=lang),
            GoogleTrendsIngestor.fetch_autocomplete_matrix(query, lang=lang, region=region),
            DuckDuckGoIngestor.fetch_lsi_suggestions(query),
            HackerNewsIngestor.fetch_signals(query),
            GitHubTrendingIngestor.fetch_signals(query),
        ]
        if lang == "ru":
            tasks.append(HabrIngestor.fetch_signals(query))

        raw_batches = await asyncio.gather(*tasks, return_exceptions=True)
        aggregated: List[Dict[str, Any]] = []
        for batch in raw_batches:
            if isinstance(batch, list):
                aggregated.extend(batch)

        return cluster_and_rank_signals(aggregated)[:10]
