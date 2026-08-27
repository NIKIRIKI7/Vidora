"""Инжесторы B2B/IT ранних сигналов: HackerNews (Algolia + Firebase) и GitHub (API + Trending).

Фиксируют инфоповод (релиз библиотеки, спор архитекторов, уязвимость) за 24–48 часов
до появления массовых роликов на YouTube. 100% free, без авторизации.
Все запросы идут через единый DeepTrendHTTPPool (HTTP/2 Keep-Alive).
"""

import asyncio
import re
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from app.infrastructure.youtube.circuit_cache import DeepTrendCircuitCache
from app.infrastructure.youtube.http_client import DeepTrendHTTPPool
from app.infrastructure.youtube.normalizer import clean_search_keyword, parse_published_to_hours


class HackerNewsIngestor:
    """Сбор инфоповодов через HN Algolia Search API + Firebase Top Stories (fallback)."""

    ALGOLIA_API_URL = "https://hn.algolia.com/api/v1/search"
    FIREBASE_TOP_URL = "https://hacker-news.firebaseio.com/v0/topstories.json"
    FIREBASE_ITEM_URL = "https://hacker-news.firebaseio.com/v0/item/{item_id}.json"

    @classmethod
    async def fetch_signals(cls, query: str, limit: int = 12) -> List[Dict[str, Any]]:
        clean_q = clean_search_keyword(query)
        cache_key = f"hn_signals_{clean_q.lower()}"
        cached = DeepTrendCircuitCache.get_l1(cache_key)
        if cached is not None:
            return cached

        results: List[Dict[str, Any]] = []
        now_ts = int(datetime.now(timezone.utc).timestamp())
        week_ago_ts = now_ts - (7 * 86400)

        params = {
            "query": clean_q,
            "tags": "story",
            "numericFilters": f"created_at_i>{week_ago_ts}",
            "hitsPerPage": str(limit),
        }

        client = await DeepTrendHTTPPool.get_client()
        try:
            res = await client.get(cls.ALGOLIA_API_URL, params=params)
            if res.status_code == 200:
                for hit in res.json().get("hits", []):
                    title = hit.get("title") or ""
                    if not title:
                        continue
                    points = int(hit.get("points") or 0)
                    num_comments = int(hit.get("num_comments") or 0)
                    created_ts = hit.get("created_at_i") or now_ts
                    age_hours = max(0.1, (now_ts - created_ts) / 3600.0)
                    story_id = hit.get("objectID")
                    hn_url = f"https://news.ycombinator.com/item?id={story_id}"

                    results.append({
                        "title": title,
                        "query": clean_q,
                        "platform": "hackernews",
                        "url": hn_url,
                        "external_url": hit.get("url") or hn_url,
                        "upvotes": points,
                        "comments": num_comments,
                        "bookmarks": int(points * 0.3),
                        "age_hours": age_hours,
                        "demand_score": min(98.0, 45.0 + (points * 0.25) + (num_comments * 0.4)),
                        "breakout": points > 250 or num_comments > 150,
                    })
        except Exception as e:
            print(f"[HackerNews Ingestor Error] {e}")

        # 2. Фоллбэк: общий Top Stories, если точечный поиск пуст
        if len(results) < 3:
            try:
                top_res = await client.get(cls.FIREBASE_TOP_URL)
                if top_res.status_code == 200:
                    top_ids = top_res.json()[:10]

                    async def _fetch_item(i_id: int):
                        try:
                            r = await client.get(cls.FIREBASE_ITEM_URL.format(item_id=i_id))
                            return r.json() if r.status_code == 200 else None
                        except Exception:
                            return None

                    items = await asyncio.gather(*[_fetch_item(i) for i in top_ids], return_exceptions=True)
                    for it in items:
                        if not isinstance(it, dict) or not it.get("title"):
                            continue
                        score = int(it.get("score") or 0)
                        comments_count = int(it.get("descendants") or 0)
                        created_ts = it.get("time") or now_ts
                        age_h = max(0.1, (now_ts - created_ts) / 3600.0)
                        s_id = it.get("id")
                        hn_url = f"https://news.ycombinator.com/item?id={s_id}"

                        results.append({
                            "title": it["title"],
                            "query": clean_q,
                            "platform": "hackernews",
                            "url": hn_url,
                            "external_url": it.get("url") or hn_url,
                            "upvotes": score,
                            "comments": comments_count,
                            "bookmarks": int(score * 0.25),
                            "age_hours": age_h,
                            "demand_score": min(95.0, 50.0 + (score * 0.2)),
                            "breakout": score > 300,
                        })
            except Exception:
                pass

        DeepTrendCircuitCache.set_l1(cache_key, results, ttl=600.0)
        return results


class GitHubTrendingIngestor:
    """Сбор быстрорастущих репозиториев (API search + парсинг Trending feed fallback)."""

    TRENDING_URL = "https://github.com/trending"
    SEARCH_API_URL = "https://api.github.com/search/repositories"

    @classmethod
    async def fetch_signals(cls, query: str, limit: int = 10) -> List[Dict[str, Any]]:
        clean_q = clean_search_keyword(query)
        cache_key = f"gh_trending_{clean_q.lower()}"
        cached = DeepTrendCircuitCache.get_l1(cache_key)
        if cached is not None:
            return cached

        results: List[Dict[str, Any]] = []
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
        api_params = {
            "q": f"{clean_q} created:>{week_ago}",
            "sort": "stars",
            "order": "desc",
            "per_page": str(limit),
        }

        client = await DeepTrendHTTPPool.get_client()
        try:
            res = await client.get(cls.SEARCH_API_URL, params=api_params)
            if res.status_code == 200:
                for repo in res.json().get("items", []):
                    name = repo.get("full_name") or ""
                    desc = repo.get("description") or "Open-source tool"
                    stars = int(repo.get("stargazers_count") or 0)
                    forks = int(repo.get("forks_count") or 0)
                    repo_url = repo.get("html_url") or f"https://github.com/{name}"

                    results.append({
                        "title": f"{name}: {desc[:90]}",
                        "query": clean_q,
                        "platform": "github",
                        "url": repo_url,
                        "upvotes": stars,
                        "comments": forks,
                        "bookmarks": stars,
                        "age_hours": parse_published_to_hours(repo.get("pushed_at") or ""),
                        "demand_score": min(99.0, 60.0 + (stars * 0.1)),
                        "breakout": stars > 500,
                    })
        except Exception as e:
            print(f"[GitHub API Error] {e}")

        # 2. Фоллбэк: парсинг главной ленты Trending по суточному приросту звёзд
        if not results:
            try:
                trend_res = await client.get(cls.TRENDING_URL)
                if trend_res.status_code == 200:
                    html = trend_res.text
                    articles = re.findall(r'<article class="Box-row">([\s\S]*?)</article>', html)
                    for art in articles[:limit]:
                        repo_match = re.search(r'href="\/([^\/"]+\/[^\/"]+)"', art)
                        if not repo_match:
                            continue
                        repo_path = repo_match.group(1)
                        desc_match = re.search(r'<p class="col-9[^>]*>([\s\S]*?)<\/p>', art)
                        desc = re.sub(r'<[^>]+>|\s+', ' ', desc_match.group(1)).strip() if desc_match else "Trending tool"
                        stars_today_match = re.search(r'(\d+[\d,]*)\s+stars today', art)
                        stars_today = int(stars_today_match.group(1).replace(",", "")) if stars_today_match else 250

                        results.append({
                            "title": f"{repo_path}: {desc[:90]}",
                            "query": clean_q,
                            "platform": "github",
                            "url": f"https://github.com/{repo_path}",
                            "upvotes": stars_today * 3,
                            "comments": int(stars_today * 0.4),
                            "bookmarks": stars_today * 2,
                            "age_hours": 12.0,
                            "demand_score": min(98.0, 70.0 + (stars_today * 0.05)),
                            "breakout": stars_today >= 500,
                        })
            except Exception as e:
                print(f"[GitHub Trending Scrape Error] {e}")

        DeepTrendCircuitCache.set_l1(cache_key, results, ttl=600.0)
        return results
