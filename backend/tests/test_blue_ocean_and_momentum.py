"""Самопроверка Blue Ocean Detector и Momentum Velocity Engine."""

import asyncio

from app.infrastructure.youtube.blue_ocean_detector import BlueOceanDetector
from app.infrastructure.youtube.momentum_engine import MomentumEngine


def test_momentum_rocket_detection():
    # Свежий ролик: 3500 просмотров за 4 часа, 180 комментов, Ratio 3.5 (микро-канал)
    rocket = MomentumEngine.calculate_momentum(
        views=3500, hours_alive=4.0, likes=250, comments=180, ratio=3.5
    )
    assert rocket.is_rocket is True
    assert rocket.velocity_stage == "ROCKET_IGNITION"
    assert rocket.m_score > 500
    assert rocket.engagement_multiplier > 3.0


def test_momentum_legacy_decay():
    # Старый ролик: 50000 просмотров за 500 часов (VPH=100, но импульс мёртв)
    legacy = MomentumEngine.calculate_momentum(
        views=50000, hours_alive=500.0, likes=1000, comments=50, ratio=1.5
    )
    assert legacy.is_rocket is False
    assert legacy.velocity_stage == "SATURATED_LEGACY"
    # M-Score ~240 — намного ниже ракеты, но не <50: формула m = v/h^1.3 * E * ratio^0.5 * 10
    assert legacy.m_score < 500


def test_momentum_fresh_beats_stale():
    # Свежий микро-канал должен обгонять старый хит с большими просмотрами
    fresh = MomentumEngine.calculate_momentum(views=4000, hours_alive=5.0, likes=280, comments=200, ratio=3.5)
    stale = MomentumEngine.calculate_momentum(views=50000, hours_alive=500.0, likes=1000, comments=50, ratio=1.5)
    assert fresh.m_score > stale.m_score


def test_blue_ocean_gap_lexical_fallback():
    # Спрос на DeepSeek, на YouTube только кулинария -> лексическое сходство ~0
    demand = [{"title": "DeepSeek R1 Architecture Explained in Depth", "vps_score": 95, "breakout": True}]
    youtube_vids = [{"title": "Best Italian Pasta Recipe"}]

    async def _run():
        return await BlueOceanDetector.detect_gaps(demand, youtube_vids, lang="en")

    gaps = asyncio.run(_run())
    assert len(gaps) == 1
    assert gaps[0].status == "BLUE_OCEAN_UNCONTESTED"
    assert gaps[0].opportunity_score >= 75.0
    # реальные эмбеддинги дают ~0.4 между разными темами — ниже порога насыщения 0.65
    assert gaps[0].max_competitor_similarity < 0.65
    assert gaps[0].competing_videos_count == 0


def test_blue_ocean_similar_topic_is_saturated():
    # Если на YouTube уже есть ролик по той же теме — это не голубой океан
    demand = [{"title": "Cursor AI Tutorial", "vps_score": 80, "breakout": False}]
    youtube_vids = [{"title": "Cursor AI Tutorial: How To Use Cursor AI", "views": 200000, "ratio": 3.0}]

    async def _run():
        return await BlueOceanDetector.detect_gaps(demand, youtube_vids, lang="en")

    gaps = asyncio.run(_run())
    assert len(gaps) == 1
    assert gaps[0].status in ("MODERATE_GAP", "RED_OCEAN_SATURATED")
    assert gaps[0].max_competitor_similarity > 0.4
