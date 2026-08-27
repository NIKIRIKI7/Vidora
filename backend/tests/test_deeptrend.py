"""Самопроверка DeepTrend Core 2.0: скоринг, кластеризация, кэш-предохранители, экспорт."""

import os

from app.domain.schemas.youtube import EarlySignalItem, ViralVideoResult
from app.infrastructure.youtube.circuit_cache import DeepTrendCircuitCache
from app.infrastructure.youtube.scoring import (
    calculate_social_velocity,
    calculate_vps_score,
    cluster_and_rank_signals,
)
from app.infrastructure.youtube.exporter import YouTubeExporter
from app.infrastructure.youtube.prompts import VIRAL_IDEAS_AGENT_PROMPT_RU, VIRAL_IDEAS_AGENT_PROMPT_EN, HOOK_ANALYZER_SYSTEM_PROMPT_EN
from app.domain.schemas.youtube import DeepTrendAnalysis, IdeaPackageItem, SeoMetadata
from app.infrastructure.ai.llm.gateway import LLMGateway
from pathlib import Path


def test_social_velocity_calculation():
    vel = calculate_social_velocity(upvotes=100, comments=20, bookmarks=40, age_hours=10.0)
    assert vel > 15.0
    fresh_vel = calculate_social_velocity(upvotes=100, comments=20, bookmarks=40, age_hours=1.0)
    assert fresh_vel > vel


def test_vps_score_breakout():
    vps, demand, _ = calculate_vps_score(demand_score=80.0, social_velocity=60.0, cross_platform_count=3, is_breakout=True)
    assert vps >= 90
    assert demand == 100.0


def test_circuit_cache_and_circuit_breaker():
    DeepTrendCircuitCache.clear_all()
    assert DeepTrendCircuitCache.is_service_available("reddit") is True

    DeepTrendCircuitCache.set_l1("test_query", {"status": "ok"}, ttl=60.0)
    assert DeepTrendCircuitCache.get_l1("test_query") == {"status": "ok"}

    DeepTrendCircuitCache.record_service_failure("reddit", "429")
    DeepTrendCircuitCache.record_service_failure("reddit", "429")
    assert DeepTrendCircuitCache.is_service_available("reddit") is True
    DeepTrendCircuitCache.record_service_failure("reddit", "429")
    assert DeepTrendCircuitCache.is_service_available("reddit") is False

    DeepTrendCircuitCache.record_service_success("reddit")
    assert DeepTrendCircuitCache.is_service_available("reddit") is True


def test_cluster_and_rank_signals():
    raw = [
        {"title": "DeepSeek V3 Benchmarks", "platform": "reddit", "upvotes": 500, "comments": 120, "bookmarks": 80, "age_hours": 4.0},
        {"title": "DeepSeek V3 Benchmarks", "platform": "habr", "upvotes": 60, "comments": 40, "bookmarks": 110, "age_hours": 6.0},
        {"title": "Unrelated Small Topic", "platform": "duckduckgo", "upvotes": 5, "comments": 1, "bookmarks": 0, "age_hours": 48.0},
    ]
    ranked = cluster_and_rank_signals(raw)
    assert len(ranked) == 2
    assert ranked[0].cross_platform_count == 2
    assert ranked[0].vps_score > ranked[1].vps_score


def test_viral_video_result_schema():
    v = ViralVideoResult(video_id="abc123def45", title="T", channel="C", url="https://youtu.be/abc123def45")
    assert v.transcript_status == "none"
    assert v.vps_score is None
    assert v.thumbnail_url == ""


def test_excel_exporter_safe_run(tmp_path):
    videos = [
        {
            "video_id": "test1234567",
            "title": "DeepSeek vs Claude",
            "channel": "TechChannel",
            "channel_url": "https://youtube.com/@TechChannel",
            "views": 150000,
            "subs": 10000,
            "ratio": 15.0,
            "vph": 3500,
            "duration_sec": 420,
            "is_short": False,
            "url": "https://youtu.be/test1234567",
            "keyword_found": "deepseek",
            "transcript_status": "whisper_fallback",
            "transcript_sample": "Sample hook text",
            "comments_summary": "- User: Great!",
            "vps_score": 94,
        }
    ]
    path = YouTubeExporter.to_excel(videos, str(tmp_path))
    assert path != ""
    assert os.path.exists(path)


def test_viral_prompt_uses_replace_not_format():
    # Промпты содержат одинарные {} в JSON-примерах: .format() упадёт, .replace() должен работать.
    for prompt in (VIRAL_IDEAS_AGENT_PROMPT_RU, VIRAL_IDEAS_AGENT_PROMPT_EN):
        rendered = prompt.replace("{channel_context}", "Tech channel")
        assert "Tech channel" in rendered
        assert "{channel_context}" not in rendered
        assert "Viral" in rendered or "вирусный" in rendered


def test_deeptrend_analysis_schema():
    data = {
        "psychology": {"viewer_fear": "F", "viewer_aspiration": "A", "skepticism_barrier": "S"},
        "ideas": [
            {"concept_id": "A", "angle_type": "Contrarian", "titles": ["T1"], "description": "D", "psychological_hook": "H"}
        ],
        "best_concept_script": {
            "concept_id": "A",
            "hook_0_5s": {"spoken": "s", "visual_cues": "v"},
            "stakes_5_20s": {"spoken": "s", "visual_cues": "v"},
            "open_loop_20_45s": {"spoken": "s", "visual_cues": "v"},
        },
        "seo": {"primary_keyword": "k", "tags": ["t1"], "timestamps": [{"time": "0:00", "label": "Hook"}]},
        "conclusions": ["c1"],
        "debug_notes": ["d1"],
    }
    parsed = DeepTrendAnalysis.model_validate(data)
    assert parsed.psychology.viewer_fear == "F"
    assert parsed.ideas[0].angle_type == "Contrarian"
    assert parsed.seo.timestamps[0].time == "0:00"
    assert parsed.best_concept_script.hook_0_5s.spoken == "s"


def test_gguf_fuzzy_match():
    files = [Path("gemma-3-4b-it-Q4_K_M.gguf"), Path("qwen2.5-coder-7b.gguf")]
    assert LLMGateway._match_gguf("gemma3:4b", files) == files[0]
    assert LLMGateway._match_gguf("gemma3:4b", []) is None
    assert LLMGateway._match_gguf("qwen2.5-coder", files) == files[1]
    # запросили gemma-3-1b, а на диске только 4b — находится по семейству gemma
    assert LLMGateway._match_gguf("gemma3:1b", files) == files[0]


def test_sanitize_temporal_references():
    from app.infrastructure.youtube.trend_analyzer import AIKeywordExpander
    out = AIKeywordExpander.sanitize_temporal_references(
        "best AI tools 2024 vs 2025 review 2023", 2026
    )
    assert "2024" not in out and "2025" not in out and "2023" not in out
    assert out.count("2026") == 3
    assert AIKeywordExpander.sanitize_temporal_references("", 2026) == ""


def test_rolling_seen_videos():
    DeepTrendCircuitCache.clear_all()
    assert DeepTrendCircuitCache.is_video_recently_seen("vid_1") is False
    DeepTrendCircuitCache.mark_videos_as_seen(["vid_1", "vid_2"])
    assert DeepTrendCircuitCache.is_video_recently_seen("vid_1") is True
    assert DeepTrendCircuitCache.is_video_recently_seen("vid_3") is False


def test_viral_prompt_has_cur_year_token():
    # Промпты обязаны содержать токен {CUR_YEAR} для замены через .replace
    from app.infrastructure.youtube.prompts import VIRAL_IDEAS_AGENT_PROMPT_RU, VIRAL_IDEAS_AGENT_PROMPT_EN
    for p in (VIRAL_IDEAS_AGENT_PROMPT_RU, VIRAL_IDEAS_AGENT_PROMPT_EN):
        rendered = p.replace("{CUR_YEAR}", "2026").replace("{channel_context}", "Tech")
        assert "2026" in rendered
        assert "{CUR_YEAR}" not in rendered


def test_pcm16_to_float32():
    # Zero-Disk RAM: s16le байты из ffmpeg pipe:1 -> нормированный float32 массив для Whisper
    import numpy as np
    from app.infrastructure.youtube.whisper_transcriber import _pcm16_to_float32

    raw = np.array([0, 16384, -32768, 32767], dtype=np.int16).tobytes()
    out = _pcm16_to_float32(raw)
    assert out.dtype == np.float32
    assert abs(out[0]) < 1e-6
    assert abs(out[1] - 0.5) < 1e-4
    assert abs(out[2] + 1.0) < 1e-4
    assert abs(out[3] - 0.99997) < 1e-4


def test_comment_goldmine_filter():
    from app.infrastructure.youtube.comment_goldmine import CommentGoldmineExtractor

    raw_comments = [
        {"author": "User1", "text": "First!", "likes": 5},
        {"author": "User2", "text": "Thanks for the video!", "likes": 2},
        {"author": "DevPro", "text": "Why did you not mention that setting X breaks memory in production? We had to downgrade.", "likes": 95},
        {"author": "Learner", "text": "How do I install this on Windows without WSL? Getting error 127.", "likes": 42},
    ]
    valuable = CommentGoldmineExtractor.filter_valuable_comments(raw_comments)
    assert len(valuable) == 2
    assert valuable[0]["author"] == "DevPro"
    assert valuable[1]["author"] == "Learner"


def test_comment_goldmine_schema_serialization():
    from app.domain.schemas.youtube import CommentGoldmineReport, ViewerPainItem

    report = CommentGoldmineReport(
        unresolved_questions=[
            ViewerPainItem(
                category="question",
                viewer_quote="How to run on Windows?",
                likes=42,
                insight="Windows WSL complexity",
                script_solution="Show 1-click Windows installer",
            )
        ],
        author_omissions=[
            ViewerPainItem(
                category="omission",
                viewer_quote="You missed setting X",
                likes=95,
                insight="Memory leak trap",
                script_solution="Warn viewer at 2:15 timestamp",
            )
        ],
        script_counter_theses=["Direct Windows fix", "Memory leak prevention"],
    )
    dump = report.model_dump()
    assert dump["unresolved_questions"][0]["category"] == "question"
    assert len(dump["script_counter_theses"]) == 2
    # лишние ключи от LLM должны молча отбрасываться
    parsed = CommentGoldmineReport.model_validate({
        **dump, "unexpected_key": 1,
    })
    assert parsed.unresolved_questions[0].insight == "Windows WSL complexity"


def test_it_signals_cluster_with_github_hackernews():
    # HN и GitHub сигналы корректно проходят кластеризацию и VPS-скоринг
    from app.infrastructure.youtube.scoring import cluster_and_rank_signals

    raw = [
        {"title": "New Local LLM Runtime", "platform": "hackernews", "url": "https://news.ycombinator.com/item?id=1", "upvotes": 320, "comments": 210, "bookmarks": 96, "age_hours": 5.0, "demand_score": 80.0, "breakout": True},
        {"title": "New Local LLM Runtime", "platform": "github", "url": "https://github.com/foo/bar", "upvotes": 1200, "comments": 300, "bookmarks": 1200, "age_hours": 12.0, "demand_score": 90.0, "breakout": True},
    ]
    ranked = cluster_and_rank_signals(raw)
    assert len(ranked) == 1
    assert ranked[0].cross_platform_count == 2
    assert "hackernews" in ranked[0].metrics["platforms"]
    assert "github" in ranked[0].metrics["platforms"]
    # 2 платформы -> m_cross=60, максимум VPS = 40+35+15 = 90
    assert ranked[0].vps_score == 90
