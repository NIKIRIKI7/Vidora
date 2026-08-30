"""Кросс-языковой арбитраж трендов (US/EN -> локальный рынок).

Глобальные всплески (Reddit/HN/GitHub) опережают локальные рынки на 14-30 дней.
Движок находит взрывные EN-сигналы и проверяет контентный вакуум на целевом языке.
"""

import asyncio
from typing import Any, Dict, List, Optional

import numpy as np

from app.domain.schemas.youtube import ArbitrageOpportunity
from app.infrastructure.youtube.normalizer import normalize_language_code
from app.infrastructure.youtube.signal_ingestor import SignalIngestor


class TrendArbitrageEngine:
    """Движок арбитража трендов: глобальный спрос -> локальный контентный вакуум."""

    @classmethod
    async def detect_arbitrage_opportunities(
        cls,
        query: str,
        target_lang: str = "ru",
        local_youtube_videos: Optional[List[Dict[str, Any]]] = None,
    ) -> List[ArbitrageOpportunity]:
        target_code, _, target_name = normalize_language_code(target_lang)
        if target_code == "en":
            # Для английского арбитраж не требуется
            return []

        # 1. Сбор глобальных EN-сигналов (Reddit / HackerNews / GitHub)
        en_signals = await SignalIngestor.collect_early_signals(query, lang="en")
        if not en_signals:
            return []

        # Отбираем только сигналы с подтвержденным спросом (VPS >= 75)
        hot_en_signals = [s for s in en_signals if s.vps_score >= 75]
        if not hot_en_signals:
            return []

        en_titles = [s.title for s in hot_en_signals]
        yt_titles = [v.get("title", "") for v in (local_youtube_videos or []) if v.get("title")]

        # 2. Векторная проекция через мультиязычный энкодер
        #    (ленивый импорт — FastEmbeddingEngine живет в blue_ocean_detector, что создает цикл)
        def _calc_embeddings():
            from app.infrastructure.youtube.blue_ocean_detector import FastEmbeddingEngine
            en_vecs = FastEmbeddingEngine.embed_texts(en_titles, lang="en")
            yt_vecs = FastEmbeddingEngine.embed_texts(yt_titles, lang=target_code) if yt_titles else None
            return en_vecs, yt_vecs

        en_vectors, yt_vectors = await asyncio.to_thread(_calc_embeddings)
        opportunities: List[ArbitrageOpportunity] = []

        if en_vectors is None or yt_vectors is None or len(yt_titles) == 0:
            # YouTube пуст по теме — все EN сигналы являются 100% арбитражем
            for sig in hot_en_signals[:3]:
                opportunities.append(
                    ArbitrageOpportunity(
                        en_topic=sig.title,
                        target_lang_topic=sig.title,
                        arbitrage_score=round(float(sig.vps_score), 1),
                        status="ARBITRAGE_FIRST_MOVER",
                        en_vps_score=sig.vps_score,
                        actionable_plan=f"Перенести западный тренд первым: на {target_name} YouTube 0 конкурентов",
                    )
                )
            return opportunities

        # 3. Матрица семантического покрытия [EN, Local YouTube]
        norm_en = en_vectors / (np.linalg.norm(en_vectors, axis=1, keepdims=True) + 1e-9)
        norm_yt = yt_vectors / (np.linalg.norm(yt_vectors, axis=1, keepdims=True) + 1e-9)
        sim_matrix = np.dot(norm_en, norm_yt.T)

        for i, sig in enumerate(hot_en_signals):
            max_sim = float(np.max(sim_matrix[i])) if len(sim_matrix[i]) > 0 else 0.0
            # Если локальное сходство ниже 0.38 — тема свободна на целевом языке
            if max_sim <= 0.38:
                score = round(float(sig.vps_score * (1.0 - max_sim)), 1)
                opportunities.append(
                    ArbitrageOpportunity(
                        en_topic=sig.title,
                        target_lang_topic=sig.title,
                        arbitrage_score=score,
                        status="ARBITRAGE_FIRST_MOVER",
                        en_vps_score=sig.vps_score,
                        actionable_plan=f"Адаптировать взрывной западный тренд ({sig.title[:35]}...) на {target_name}",
                    )
                )

        return sorted(opportunities, key=lambda x: x.arbitrage_score, reverse=True)
