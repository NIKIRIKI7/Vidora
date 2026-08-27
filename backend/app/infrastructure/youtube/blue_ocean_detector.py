"""Детектор «Голубых Океанов» (Semantic Gap Search).

Находит темы, где есть подтверждённый спрос в профессиональных сообществах
(Reddit/HN/Habr/Trends), но на YouTube нет качественного контента.
Векторизует пространства Спроса и Предложения через FastEmbed (ONNX, CPU) и
считает Opportunity Score: низкое сходство с рынком + высокий VPS спроса.
"""

import asyncio
import re
from typing import Any, Dict, List, Optional

import numpy as np

from app.domain.schemas.youtube import BlueOceanOpportunity
from app.infrastructure.youtube.normalizer import normalize_language_code


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
    """Детектор семантического дефицита контента на YouTube."""

    @classmethod
    def _cosine_similarity_matrix(cls, a: np.ndarray, b: np.ndarray) -> np.ndarray:
        norm_a = np.linalg.norm(a, axis=1, keepdims=True) + 1e-9
        norm_b = np.linalg.norm(b, axis=1, keepdims=True) + 1e-9
        return np.dot(a / norm_a, (b / norm_b).T)

    @staticmethod
    def _lexical_similarity_fallback(query: str, candidate: str) -> float:
        """Jaccard по словам — фоллбэк, если эмбеддинги недоступны."""
        q_words = set(re.findall(r"\w+", query.lower()))
        c_words = set(re.findall(r"\w+", candidate.lower()))
        if not q_words or not c_words:
            return 0.0
        return len(q_words & c_words) / len(q_words | c_words)

    @classmethod
    def _classify(cls, score: float) -> tuple:
        if score >= 74.0:
            return "BLUE_OCEAN_UNCONTESTED", "Снять подробное пошаговое руководство — на YouTube нет прямых конкурентов"
        if score >= 48.0:
            return "MODERATE_GAP", "Существующие ролики поверхностны — сделать глубокий технический разбор"
        return "RED_OCEAN_SATURATED", "Тема перегрета — заходить только с агрессивным Contrarian-хуком"

    @classmethod
    async def detect_gaps(
        cls,
        demand_signals: List[Dict[str, Any]],
        youtube_videos: List[Dict[str, Any]],
        lang: str = "ru",
    ) -> List[BlueOceanOpportunity]:
        if not demand_signals:
            return []

        lang_code, _, _ = normalize_language_code(lang)
        demand_titles = [s.get("title", "") for s in demand_signals if s.get("title")]
        yt_titles = [v.get("title", "") for v in youtube_videos if v.get("title")]
        if not demand_titles:
            return []

        def _calc_embeddings():
            d_vecs = FastEmbeddingEngine.embed_texts(demand_titles, lang=lang_code)
            y_vecs = FastEmbeddingEngine.embed_texts(yt_titles, lang=lang_code) if yt_titles else None
            return d_vecs, y_vecs

        d_vectors, y_vectors = await asyncio.to_thread(_calc_embeddings)

        opportunities: List[BlueOceanOpportunity] = []

        def _source_of(signal: Dict[str, Any]) -> str:
            return signal.get("platform") or signal.get("source_platform", "community")

        # Фоллбэк без эмбеддингов: лексическое пересечение слов
        if d_vectors is None or y_vectors is None or len(yt_titles) == 0:
            for signal in demand_signals[:6]:
                topic = signal.get("title", "")
                max_sim = 0.0
                if yt_titles:
                    max_sim = max(cls._lexical_similarity_fallback(topic, yt) for yt in yt_titles)

                vps_score = float(signal.get("vps_score", 60.0))
                final_score = max(0.0, min(100.0, (1.0 - max_sim) * 100.0 * (1.0 + vps_score / 200.0)))
                if signal.get("breakout"):
                    final_score = min(100.0, final_score + 10.0)
                status, angle = cls._classify(final_score)

                opportunities.append(
                    BlueOceanOpportunity(
                        topic=topic,
                        opportunity_score=round(final_score, 1),
                        status=status,
                        max_competitor_similarity=round(max_sim, 2),
                        competing_videos_count=1 if max_sim > 0.4 else 0,
                        demand_source=_source_of(signal),
                        actionable_angle=angle,
                    )
                )
            return sorted(opportunities, key=lambda x: x.opportunity_score, reverse=True)

        # Матрица косинусного сходства [N_demand, M_youtube]
        sim_matrix = cls._cosine_similarity_matrix(d_vectors, y_vectors)

        for i, signal in enumerate(demand_signals):
            sims = sim_matrix[i]
            max_sim = float(np.max(sims)) if len(sims) > 0 else 0.0
            saturation_count = int(np.sum(sims >= 0.65))

            vps_score = float(signal.get("vps_score", 50.0))
            is_breakout = bool(signal.get("breakout", False))

            raw_score = (1.0 - max_sim) * 100.0
            vps_multiplier = 1.0 + (vps_score / 200.0)
            density_penalty = saturation_count * 4.5
            final_score = max(0.0, min(100.0, (raw_score * vps_multiplier) - density_penalty))
            if is_breakout:
                final_score = min(100.0, final_score + 10.0)

            status, angle = cls._classify(final_score)
            opportunities.append(
                BlueOceanOpportunity(
                    topic=signal.get("title", ""),
                    opportunity_score=round(final_score, 1),
                    status=status,
                    max_competitor_similarity=round(max_sim, 2),
                    competing_videos_count=saturation_count,
                    demand_source=_source_of(signal),
                    actionable_angle=angle,
                )
            )

        return sorted(opportunities, key=lambda x: x.opportunity_score, reverse=True)
