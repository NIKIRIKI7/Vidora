"""Математическая модель Viral Potential Score и кластеризация сигналов."""

import math
import re
from typing import Any, Dict, List, Tuple

from app.domain.schemas.youtube import EarlySignalItem


def calculate_social_velocity(
    upvotes: int,
    comments: int,
    bookmarks: int,
    age_hours: float,
) -> float:
    """V_social = (Upvotes + Comments*2.5 + Bookmarks*3.5) / ((AgeHours + 2) ** 1.15)"""
    raw_engagement = float(upvotes) + (float(comments) * 2.5) + (float(bookmarks) * 3.5)
    effective_age = max(0.1, float(age_hours) + 2.0)
    return round(raw_engagement / math.pow(effective_age, 1.15), 3)


def calculate_vps_score(
    demand_score: float,
    social_velocity: float,
    cross_platform_count: int,
    is_breakout: bool = False,
    is_organic: bool = True,
) -> Tuple[int, float, float]:
    """VPS = S_demand*0.40 + V_social_norm*0.35 + M_cross*0.25"""
    s_demand = 100.0 if is_breakout else max(0.0, min(100.0, float(demand_score)))
    v_norm = min(100.0, social_velocity * 1.6)
    m_cross = 100.0 if cross_platform_count >= 3 else (60.0 if cross_platform_count == 2 else 20.0)
    vps = (s_demand * 0.40) + (v_norm * 0.35) + (m_cross * 0.25)
    # Штраф 70% для накрученных бот-фермами тредов
    if not is_organic:
        vps *= 0.30
    return int(round(max(0.0, min(100.0, vps)))), s_demand, v_norm


def extract_keywords_from_text(text: str) -> List[str]:
    clean = re.sub(r"[^\w\s\u0400-\u04FF-]", " ", text)
    tokens = [w.strip() for w in clean.split() if len(w.strip()) >= 3]
    stopwords = {
        "and", "the", "for", "with", "this", "that", "how", "what", "from",
        "sponsors", "makes", "your",
        "для", "как", "что", "это", "или", "все", "про", "при", "через", "после",
        "почему", "зачем",
    }
    return [t for t in tokens if t.lower() not in stopwords]


def cluster_and_rank_signals(raw_signals: List[Dict[str, Any]]) -> List[EarlySignalItem]:
    if not raw_signals:
        return []

    clusters: Dict[str, Dict[str, Any]] = {}
    for item in raw_signals:
        title = item.get("title", "").strip()
        if not title:
            continue

        # Фильтр мусорных спонсорских ссылок GitHub Sponsors
        if title.lower().startswith("sponsors/"):
            continue

        keywords = extract_keywords_from_text(title)
        short_key = " ".join(sorted(keywords[:3])) if keywords else title.lower()[:30]

        cluster = clusters.get(short_key)
        if cluster is None:
            cluster = {
                "id": f"sig_{abs(hash(short_key)) % 100000:05d}",
                "title": title,
                "query": title,  # Точный заголовок для поиска видео при клике на карточку
                "platforms": set(),
                "demand_score": item.get("demand_score", 50.0),
                "upvotes": 0, "comments": 0, "bookmarks": 0,
                "min_age_hours": 999999.0,
                "source_url": item.get("url"),
                "source_platform": item.get("platform", "web"),
                "breakout": item.get("breakout", False),
                "keywords": set(),
            }
            clusters[short_key] = cluster

        cluster["platforms"].add(item.get("platform", "web"))
        cluster["demand_score"] = max(cluster["demand_score"], item.get("demand_score", 50.0))
        cluster["upvotes"] += item.get("upvotes", 0)
        cluster["comments"] += item.get("comments", 0)
        cluster["bookmarks"] += item.get("bookmarks", 0)
        cluster["min_age_hours"] = min(cluster["min_age_hours"], item.get("age_hours", 24.0))
        if item.get("breakout"):
            cluster["breakout"] = True
        cluster["keywords"].update(keywords)

    ranked_pool: List[EarlySignalItem] = []
    for entry in clusters.values():
        is_organic = not (entry["upvotes"] > 300 and entry["comments"] < 5)

        vel = calculate_social_velocity(
            upvotes=entry["upvotes"], comments=entry["comments"], bookmarks=entry["bookmarks"],
            age_hours=entry["min_age_hours"] if entry["min_age_hours"] < 999999.0 else 24.0,
        )
        cross_count = len(entry["platforms"])
        vps, demand, _ = calculate_vps_score(
            demand_score=entry["demand_score"], social_velocity=vel,
            cross_platform_count=cross_count, is_breakout=entry["breakout"],
            is_organic=is_organic,
        )
        ranked_pool.append(EarlySignalItem(
            id=entry["id"], title=entry["title"],
            query=entry["title"],  # Гарантирует поиск по конкретной теме при клике «Ролики»
            vps_score=vps, demand_score=round(demand, 1), social_velocity=round(vel, 2),
            cross_platform_count=cross_count, source_platform=entry["source_platform"],
            source_url=entry["source_url"], source_title=entry["title"],
            breakout=entry["breakout"] and is_organic,
            growth_pct="+5000% (Breakout)" if (entry["breakout"] and is_organic) else f"+{int(demand * 7.5)}%",
            metrics={
                "upvotes": entry["upvotes"], "comments": entry["comments"],
                "bookmarks": entry["bookmarks"], "platforms": sorted(entry["platforms"]),
                "is_organic": is_organic,
            },
            keywords=list(entry["keywords"])[:8],
        ))

    # Fair-Share Platform Balancing: GitHub/HN с тысячами звезд не вытесняют Reddit
    by_platform: Dict[str, List[EarlySignalItem]] = {}
    for item in ranked_pool:
        by_platform.setdefault(item.source_platform, []).append(item)
    for p in by_platform:
        by_platform[p].sort(key=lambda s: s.vps_score, reverse=True)

    balanced_results: List[EarlySignalItem] = []
    quotas = [("reddit", 4), ("hackernews", 3), ("github", 3)]
    for platform, count in quotas:
        if platform in by_platform:
            balanced_results.extend(by_platform[platform][:count])

    # Дополняем оставшиеся слоты до 10 лучшими сигналами из общего пула
    existing_ids = {s.id for s in balanced_results}
    remaining = [
        s for s in sorted(ranked_pool, key=lambda x: x.vps_score, reverse=True)
        if s.id not in existing_ids
    ]
    balanced_results.extend(remaining)

    return balanced_results[:10]
