"""Семантическая кластеризация тем в 384-D векторном пространстве (Dense Clusterizer).

Объединяет перефразировки с разных платформ (Reddit/HN/GitHub/Habr) в супер-кластеры
по близости мультиязычных эмбеддингов вместо строковой эвристики. Для малых пакетов
(N <= 60) используется граф косинусной связности (быстрее и детерминированнее HDBSCAN).
"""

import re
from typing import Any, Dict, List, Optional

import numpy as np

from app.domain.schemas.youtube import EarlySignalItem
from app.infrastructure.youtube.scoring import calculate_social_velocity, calculate_vps_score


class DenseVectorClusterizer:
    """Кластеризатор тем на базе семантической плотности векторов FastEmbed."""

    @classmethod
    def _cosine_similarity_matrix(cls, vectors: np.ndarray) -> np.ndarray:
        norms = np.linalg.norm(vectors, axis=1, keepdims=True) + 1e-9
        normalized = vectors / norms
        return np.dot(normalized, normalized.T)

    @classmethod
    def cluster_signals_dense(
        cls,
        raw_signals: List[Dict[str, Any]],
        vectors: Optional[np.ndarray] = None,
        similarity_threshold: float = 0.78,
    ) -> List[EarlySignalItem]:
        if not raw_signals:
            return []

        n = len(raw_signals)
        if vectors is None or len(vectors) != n:
            # Fallback на строковую кластеризацию без векторов
            from app.infrastructure.youtube.scoring import cluster_and_rank_signals
            return cluster_and_rank_signals(raw_signals)

        # Матрица попарного косинусного сходства
        sim_matrix = cls._cosine_similarity_matrix(vectors)
        visited = [False] * n
        clusters: List[List[int]] = []

        # Связные компоненты (Adjacency Graph) с контролем дисперсии кластера
        for i in range(n):
            if visited[i]:
                continue
            cluster_indices = [i]
            visited[i] = True

            for j in range(i + 1, n):
                if not visited[j] and sim_matrix[i, j] >= similarity_threshold:
                    # Strict Silhouette Gating: не схлопывать широкие темы
                    if all(sim_matrix[k, j] >= (similarity_threshold - 0.08) for k in cluster_indices):
                        cluster_indices.append(j)
                        visited[j] = True

            clusters.append(cluster_indices)

        ranked_items: List[EarlySignalItem] = []
        for c_indices in clusters:
            members = [raw_signals[idx] for idx in c_indices]

            # Экзампляр кластера — сигнал с максимальным вовлечением
            best_member = max(
                members,
                key=lambda x: (x.get("upvotes", 0) + x.get("comments", 0) * 2),
            )

            total_upvotes = sum(m.get("upvotes", 0) for m in members)
            total_comments = sum(m.get("comments", 0) for m in members)
            total_bookmarks = sum(m.get("bookmarks", 0) for m in members)
            min_age = min(m.get("age_hours", 24.0) for m in members)
            platforms = sorted({str(m.get("platform", "web")) for m in members})
            cross_count = len(platforms)
            is_breakout = any(m.get("breakout", False) for m in members)
            max_demand = max(m.get("demand_score", 50.0) for m in members)

            # Organic Engagement Anomaly Filter
            is_organic = not (total_upvotes > 300 and total_comments < 5)

            vel = calculate_social_velocity(
                upvotes=total_upvotes,
                comments=total_comments,
                bookmarks=total_bookmarks,
                age_hours=min_age,
            )
            vps, demand, _ = calculate_vps_score(
                demand_score=max_demand,
                social_velocity=vel,
                cross_platform_count=cross_count,
                is_breakout=is_breakout,
                is_organic=is_organic,
            )

            all_keywords: List[str] = []
            for m in members:
                for w in re.findall(r"[\w\u0400-\u04FF]{3,}", m.get("title", "")):
                    if w.lower() not in all_keywords:
                        all_keywords.append(w.lower())

            cid = f"dense_{abs(hash(best_member.get('title', ''))) % 100000:05d}"
            ranked_items.append(
                EarlySignalItem(
                    id=cid,
                    title=best_member.get("title", ""),
                    query=best_member.get("query", best_member.get("title", "")),
                    vps_score=vps,
                    demand_score=round(demand, 1),
                    social_velocity=round(vel, 2),
                    cross_platform_count=cross_count,
                    source_platform=best_member.get("platform", "web"),
                    source_url=best_member.get("url"),
                    source_title=best_member.get("title"),
                    breakout=is_breakout and is_organic,
                    growth_pct="+5000% (Breakout)" if (is_breakout and is_organic) else f"+{int(demand * 7.5)}%",
                    metrics={
                        "upvotes": total_upvotes,
                        "comments": total_comments,
                        "bookmarks": total_bookmarks,
                        "platforms": platforms,
                        "cluster_size": len(members),
                        "is_organic": is_organic,
                    },
                    keywords=all_keywords[:8],
                )
            )

        return sorted(ranked_items, key=lambda s: s.vps_score, reverse=True)
