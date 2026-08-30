"""Тесты качественной аналитики «Голубые Океаны 3.0»: все 5 модулей."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np

from app.infrastructure.youtube.blue_ocean_detector import FastEmbeddingEngine
from app.infrastructure.youtube.confusion_detector import ConfusionDetector
from app.infrastructure.youtube.dense_clusterizer import DenseVectorClusterizer
from app.infrastructure.youtube.momentum_engine import MomentumEngine
from app.infrastructure.youtube.thumbnail_vision import ThumbnailVisionEngine
from app.infrastructure.youtube.trend_arbitrage import TrendArbitrageEngine


def _run(coro):
    return asyncio.run(coro)


# 1. Momentum 2.0: Rocket Ignition и веса комментариев
def test_momentum_2_rocket_ignition():
    res = MomentumEngine.calculate_momentum(
        views=3500,
        hours_alive=3.0,
        likes=200,
        comments=180,  # Высокий вес комментариев x30
        ratio=3.5,
    )
    assert res.is_rocket is True
    assert res.velocity_stage == "ROCKET_IGNITION"
    assert res.m_score >= 500
    assert "🔥" in res.acceleration_pct


# 2. Confusion Index: детекция Псевдо-Красных Океанов
def test_confusion_index_pseudo_red_detection():
    comments = [
        {"text": "Почему этот код не работает на Windows 11? Ошибка 127!"},
        {"text": "How do I install the dependencies? The guide missed step 3."},
        {"text": "Выдает ошибку при компиляции, помогите пожалуйста."},
        {"text": "Better to use Docker instead, your method is broken."},
        {"text": "Где ссылка на репозиторий? В описании пусто."},
    ]
    confusion = ConfusionDetector.analyze_comments_friction(
        comments=comments, video_views=150000, ratio=4.0
    )
    assert confusion.confusion_index >= 0.40
    assert confusion.status == "PSEUDO_RED_DISRUPTIVE"
    assert "Снять ролик-исправление" in confusion.actionable_fix


# 3. Dense Vector Clusterizer: объединение перефразировок
def test_dense_vector_clustering_merges_paraphrases():
    signals = [
        {"title": "DeepSeek R1 full architecture breakdown", "platform": "reddit", "upvotes": 400, "comments": 80},
        {"title": "Breakdown of DeepSeek R1 reasoning architecture", "platform": "hackernews", "upvotes": 600, "comments": 150},
        {"title": "Unrelated Cooking Recipe", "platform": "trends", "upvotes": 5, "comments": 0},
    ]
    v1 = np.array([0.9, 0.1, 0.0], dtype=np.float32)
    v2 = np.array([0.89, 0.11, 0.0], dtype=np.float32)
    v3 = np.array([0.0, 0.0, 1.0], dtype=np.float32)
    vectors = np.array([v1, v2, v3])

    clustered = DenseVectorClusterizer.cluster_signals_dense(signals, vectors=vectors, similarity_threshold=0.85)
    assert len(clustered) == 2  # Первые 2 объединены в один супер-кластер
    assert clustered[0].cross_platform_count == 2
    assert "reddit" in clustered[0].metrics["platforms"]
    assert "hackernews" in clustered[0].metrics["platforms"]


# 4. Thumbnail Vision: когнитивный разрыв
def test_thumbnail_curiosity_gap_evaluation():
    gap_type, summary = ThumbnailVisionEngine._evaluate_curiosity_gap(
        title="I Tested 5 Local LLM Models", overlay="DON'T USE THIS"
    )
    assert gap_type == "negative_warning"
    assert "предостережение" in summary


# 5. Trend Arbitrage: US -> RU
def test_trend_arbitrage_first_mover():
    mock_en_signals = [
        MagicMock(title="Claude 3.7 Sonnet Hybrid Reasoning Architecture", vps_score=95)
    ]
    yt_videos = [{"title": "Обзор старой модели Claude 3.5"}]

    async def _coro():
        with patch("app.infrastructure.youtube.signal_ingestor.SignalIngestor.collect_early_signals", new_callable=AsyncMock) as mock_sig:
            mock_sig.return_value = mock_en_signals
            with patch.object(FastEmbeddingEngine, "embed_texts") as mock_embed:
                # Низкое сходство EN темы с RU YouTube (< 0.20)
                mock_embed.side_effect = [
                    np.array([[1.0, 0.0]]),  # EN vector
                    np.array([[0.1, 0.9]]),  # RU YouTube vector
                ]
                return await TrendArbitrageEngine.detect_arbitrage_opportunities(
                    query="Claude 3.7", target_lang="ru", local_youtube_videos=yt_videos
                )

    opportunities = _run(_coro())
    assert len(opportunities) == 1
    assert opportunities[0].status == "ARBITRAGE_FIRST_MOVER"
    assert opportunities[0].arbitrage_score >= 70.0
