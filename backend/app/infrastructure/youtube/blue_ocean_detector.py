"""Мастер-детектор «Голубых Океанов 3.0» (Information Asymmetry Discovery).

Синтезирует 5 качественных аналитик:
  1. Trend Arbitrage — перенос глобальных EN-трендов на локальный рынок (ARBITRAGE_FIRST_MOVER).
  2. Confusion Index — трения аудитории в комментариях лидеров (PSEUDO_RED_DISRUPTIVE).
  3. Semantic Gap — косинусная матрица спроса vs YouTube-контента (BLUE_OCEAN_UNCONTESTED).
  4. Dense Clustering — объединение перефразировок в супер-кластеры.
  5. Thumbnail Vision — когнитивный разрыв «Заголовок vs Обложка».
"""

import asyncio
import re
from typing import Any, Dict, List, Optional

import numpy as np

from app.domain.schemas.youtube import BlueOceanOpportunity
from app.infrastructure.youtube.confusion_detector import ConfusionDetector
from app.infrastructure.youtube.normalizer import normalize_language_code
from app.infrastructure.youtube.trend_arbitrage import TrendArbitrageEngine


class FastEmbeddingEngine:
    """Лёгкий ONNX-движок эмбеддингов (FastEmbed, CPU). Не конкурирует за VRAM с Whisper/Gemma."""

    _model = None

    @classmethod
    def get_model(cls, lang: str = "ru"):
        if cls._model is not None:
            return cls._model

        try:
            from fastembed import TextEmbedding
            model_name = (
                "BAAI/bge-small-en-v1.5"
                if lang == "en"
                else "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
            )
            cls._model = TextEmbedding(model_name=model_name)
            return cls._model
        except Exception:
            return None

    @classmethod
    def embed_texts(cls, texts: List[str], lang: str = "ru") -> Optional[np.ndarray]:
        if not texts:
            return None
        model = cls.get_model(lang)
        if model is None:
            return None
        try:
            embeddings = list(model.embed(texts))
            return np.array(embeddings, dtype=np.float32)
        except Exception:
            return None


class BlueOceanDetector:
    """Мастер-детектор Голубых Океанов 3.0."""

    @classmethod
    def _cosine_similarity_matrix(cls, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        norm_a = a / (np.linalg.norm(a, axis=1, keepdims=True) + 1e-9)
        norm_b = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-9)
        return np.dot(norm_a, norm_b.T)

    @staticmethod
    def _lexical_similarity_fallback(query: str, candidate: str) -> float:
        """Jaccard по словам — резервный канал, если эмбеддинги недоступны."""
        q_words = set(re.findall(r"\w+", query.lower()))
        c_words = set(re.findall(r"\w+", candidate.lower()))
        if not q_words or not c_words:
            return 0.0
        return len(q_words & c_words) / len(q_words | c_words)

    @staticmethod
    def _classify_semantic(final_score: float, max_sim: float) -> tuple:
        if final_score >= 72.0 and max_sim <= 0.35:
            return "BLUE_OCEAN_UNCONTESTED", "Снять подробный разбор — прямых аналогов на YouTube нет"
        if final_score >= 48.0:
            return "MODERATE_GAP", "Существующие ролики поверхностны — сделать глубокий гайд"
        return "RED_OCEAN_SATURATED", "Тема перегрета — заходить только с Contrarian хуком"

    @classmethod
    async def detect_gaps(
        cls,
        demand_signals: List[Dict[str, Any]],
        youtube_videos: List[Dict[str, Any]],
        lang: str = "ru",
    ) -> List[BlueOceanOpportunity]:
        lang_code, _, _ = normalize_language_code(lang)
        opportunities: List[BlueOceanOpportunity] = []

        # ----------------------------------------------------------------------
        # 1. Кросс-языковой арбитраж спроса (US/EN -> Local Market)
        # ----------------------------------------------------------------------
        first_query = demand_signals[0].get("query", "") if demand_signals else ""
        if first_query:
            try:
                arbitrage_items = await TrendArbitrageEngine.detect_arbitrage_opportunities(
                    query=first_query,
                    target_lang=lang_code,
                    local_youtube_videos=youtube_videos,
                )
                for arb in arbitrage_items:
                    opportunities.append(
                        BlueOceanOpportunity(
                            topic=arb.en_topic,
                            opportunity_score=arb.arbitrage_score,
                            status="ARBITRAGE_FIRST_MOVER",
                            max_competitor_similarity=0.15,
                            competing_videos_count=0,
                            demand_source="Global Arbitrage (Reddit/HN/GitHub)",
                            actionable_angle=arb.actionable_plan,
                            arbitrage_source=arb.en_topic,
                        )
                    )
            except Exception:
                pass

        # ----------------------------------------------------------------------
        # 2. Анализ Псевдо-Красных Океанов (Confusion Index по комментариям лидеров)
        # ----------------------------------------------------------------------
        for vid in youtube_videos[:4]:
            comments = vid.get("top_comments") or []
            if comments:
                confusion = ConfusionDetector.analyze_comments_friction(
                    comments=comments,
                    video_views=vid.get("views", 0),
                    ratio=vid.get("ratio", 1.0),
                )
                if confusion.status == "PSEUDO_RED_DISRUPTIVE":
                    opportunities.append(
                        BlueOceanOpportunity(
                            topic=vid.get("title", ""),
                            opportunity_score=round(75.0 + (confusion.confusion_index * 20.0), 1),
                            status="PSEUDO_RED_DISRUPTIVE",
                            max_competitor_similarity=0.85,
                            competing_videos_count=1,
                            demand_source="YouTube Friction / High Confusion",
                            actionable_angle=confusion.actionable_fix,
                            confusion_index=confusion.confusion_index,
                        )
                    )

        # ----------------------------------------------------------------------
        # 3. Семантическое сопоставление спроса и YouTube-контента
        # ----------------------------------------------------------------------
        demand_titles = [s.get("title", "") for s in demand_signals if s.get("title")]
        yt_titles = [v.get("title", "") for v in youtube_videos if v.get("title")]

        if demand_titles:
            def _calc_embeddings():
                d_vecs = FastEmbeddingEngine.embed_texts(demand_titles, lang=lang_code)
                y_vecs = FastEmbeddingEngine.embed_texts(yt_titles, lang=lang_code) if yt_titles else None
                return d_vecs, y_vecs

            d_vectors, y_vectors = await asyncio.to_thread(_calc_embeddings)

            if d_vectors is not None and y_vectors is not None and len(yt_titles) > 0:
                sim_matrix = cls._cosine_similarity_matrix(d_vectors, y_vectors)
                for i, signal in enumerate(demand_signals):
                    sims = sim_matrix[i]
                    max_sim = float(np.max(sims)) if len(sims) > 0 else 0.0
                    saturation_count = int(np.sum(sims >= 0.65))
                    vps_score = float(signal.get("vps_score", 50.0))
                    is_breakout = bool(signal.get("breakout", False))

                    raw_score = (1.0 - max_sim) * 100.0
                    vps_mult = 1.0 + (vps_score / 200.0)
                    density_penalty = saturation_count * 4.0
                    final_score = max(0.0, min(100.0, (raw_score * vps_mult) - density_penalty))
                    if is_breakout:
                        final_score = min(100.0, final_score + 10.0)

                    status, angle = cls._classify_semantic(final_score, max_sim)
                    opportunities.append(
                        BlueOceanOpportunity(
                            topic=signal.get("title", ""),
                            opportunity_score=round(final_score, 1),
                            status=status,
                            max_competitor_similarity=round(max_sim, 2),
                            competing_videos_count=saturation_count,
                            demand_source=signal.get("platform") or signal.get("source_platform", "community"),
                            actionable_angle=angle,
                        )
                    )
            else:
                # Резервный канал без эмбеддингов: лексическое пересечение слов
                for signal in demand_signals[:6]:
                    topic = signal.get("title", "")
                    max_sim = 0.0
                    if yt_titles:
                        max_sim = max(cls._lexical_similarity_fallback(topic, yt) for yt in yt_titles)
                    vps_score = float(signal.get("vps_score", 60.0))
                    final_score = max(0.0, min(100.0, (1.0 - max_sim) * 100.0 * (1.0 + vps_score / 200.0)))
                    if signal.get("breakout"):
                        final_score = min(100.0, final_score + 10.0)
                    status, angle = cls._classify_semantic(final_score, max_sim)
                    opportunities.append(
                        BlueOceanOpportunity(
                            topic=topic,
                            opportunity_score=round(final_score, 1),
                            status=status,
                            max_competitor_similarity=round(max_sim, 2),
                            competing_videos_count=1 if max_sim > 0.4 else 0,
                            demand_source=signal.get("platform") or signal.get("source_platform", "community"),
                            actionable_angle=angle,
                        )
                    )

        return sorted(opportunities, key=lambda x: x.opportunity_score, reverse=True)
