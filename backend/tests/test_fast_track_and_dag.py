"""Самопроверка Fast-Track слоя: Innertube, VAD-контроль, фильтр накруток, реактивный DAG."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np

from app.domain.schemas.youtube import AgentReq
from app.infrastructure.youtube.dag_pipeline import DeepTrendDAGPipeline
from app.infrastructure.youtube.innertube import InnertubeClient
from app.infrastructure.youtube.scoring import cluster_and_rank_signals
from app.infrastructure.youtube.whisper_transcriber import WhisperTranscriber


def _run(coro):
    return asyncio.run(coro)


def test_innertube_timedtext_extraction():
    mock_player_response = {
        "playabilityStatus": {"status": "OK"},
        "captions": {
            "playerCaptionsTracklistRenderer": {
                "captionTracks": [
                    {
                        "baseUrl": "https://www.youtube.com/api/timedtext?v=123&lang=ru",
                        "languageCode": "ru",
                        "kind": "asr",
                    }
                ]
            }
        },
    }

    mock_json3_response = {
        "events": [
            {"segs": [{"utf8": "Привет "}, {"utf8": "мир, "}]},
            {"segs": [{"utf8": "это тестовая транскрипция для проверки Innertube Fast-Track."}]},
        ]
    }

    with patch.object(InnertubeClient, "get_player_data", new_callable=AsyncMock) as mock_player:
        mock_player.return_value = mock_player_response

        with patch("app.infrastructure.youtube.http_client.DeepTrendHTTPPool.get_client", new_callable=AsyncMock) as mock_get_client:
            mock_http = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = mock_json3_response
            mock_http.get.return_value = mock_resp
            mock_get_client.return_value = mock_http

            subtitles = _run(InnertubeClient.extract_fast_subtitles("test_video_id", ["ru"]))
            assert subtitles is not None
            assert "Привет мир" in subtitles
            assert "Innertube Fast-Track" in subtitles


def test_vad_speech_density_detection():
    # 1. Буфер с тишиной (энергия близка к 0)
    silent_audio = np.zeros(16000 * 5, dtype=np.float32)
    density_silent = WhisperTranscriber._calculate_vad_speech_density(silent_audio)
    assert density_silent == 0.0

    # 2. Буфер с активным речевым сигналом
    speech_audio = (np.sin(np.linspace(0, 1000, 16000 * 5)) * 0.2).astype(np.float32)
    density_speech = WhisperTranscriber._calculate_vad_speech_density(speech_audio)
    assert density_speech > 0.80


def test_reddit_organic_engagement_anomaly_filter():
    # Накрученный бот-фермой тред (много апвоутов, нет комментов)
    fake_signal = [
        {
            "title": "Unbelievable AI Tool",
            "platform": "reddit",
            "upvotes": 1200,
            "comments": 2,  # Аномалия!
            "bookmarks": 10,
            "age_hours": 3.0,
            "demand_score": 90.0,
            "breakout": True,
        }
    ]
    ranked = cluster_and_rank_signals(fake_signal)
    assert len(ranked) == 1
    assert ranked[0].metrics["is_organic"] is False
    # VPS-Score должен быть оштрафован на 70%
    assert ranked[0].vps_score < 40


def test_dag_pipeline_event_emission():
    req = AgentReq(query="DeepSeek Architecture", project_path="projects")
    pipeline = DeepTrendDAGPipeline(req)

    test_video = {
        "video_id": "test12345",
        "title": "DeepSeek R1 Architecture",
        "channel": "Tech Lab",
        "views": 50000,
        "subs": 10000,
        "ratio": 5.0,
        "published_at": "2026-08-25T10:00:00Z",
    }

    async def _fake_search(**kwargs):
        cb = kwargs.get("on_candidate_found")
        if cb:
            cb(test_video)

    async def _run_dag():
        events = []
        with patch("app.infrastructure.youtube.trend_analyzer.AIKeywordExpander.expand_topic_with_ai", new_callable=AsyncMock) as mock_exp:
            mock_exp.return_value = ["DeepSeek R1"]
            with patch("app.infrastructure.youtube.searcher.YouTubeSearcher.search_viral_videos", new_callable=AsyncMock) as mock_search:
                mock_search.side_effect = _fake_search
                with patch("app.infrastructure.youtube.signal_ingestor.SignalIngestor.collect_early_signals", new_callable=AsyncMock) as mock_sig:
                    mock_sig.return_value = []
                    with patch("app.infrastructure.youtube.whisper_transcriber.WhisperTranscriber.transcribe_head_fast_track", new_callable=AsyncMock) as mock_whisper:
                        mock_whisper.return_value = ("", "none")
                        with patch("app.infrastructure.youtube.scraper.YtScrapeService.get_comments", new_callable=AsyncMock) as mock_comments:
                            mock_comments.return_value = []
                            async for event_line in pipeline.execute_dag("ru", "RU", "Russian", "gemma3:4b"):
                                events.append(event_line)
                                if "single_video_found" in event_line:
                                    break
        return events

    events = _run(_run_dag())
    assert any("single_video_found" in e for e in events)
    assert len(pipeline.discovered_videos) == 1
    assert pipeline.discovered_videos[0]["m_score"] is not None
