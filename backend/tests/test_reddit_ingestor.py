"""Самопроверка Reddit-инжестора: multireddit RSS, оркестратор, кэш, комментарии."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.infrastructure.youtube.circuit_cache import DeepTrendCircuitCache
from app.infrastructure.youtube.comment_goldmine import CommentGoldmineExtractor
from app.infrastructure.youtube.reddit_ingestor import RedditScraperEngine
from app.infrastructure.youtube.signal_ingestor import RedditIngestor


def _run(coro):
    return asyncio.run(coro)


def test_multireddit_rss_parsing():
    sample_atom_xml = """<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>DeepSeek R1 local inference on a laptop</title>
        <link href="https://www.reddit.com/r/LocalLLaMA/comments/abc/deepseek/"/>
        <updated>2026-08-25T12:00:00+00:00</updated>
        <category label="r/LocalLLaMA"/>
        <content type="html">&lt;p&gt;Testing the new engine on consumer hardware&lt;/p&gt;</content>
      </entry>
    </feed>
    """
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = sample_atom_xml

    with patch("app.infrastructure.youtube.http_client.DeepTrendHTTPPool.get_client", new_callable=AsyncMock) as mock_get:
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        mock_get.return_value = mock_client

        results = _run(RedditScraperEngine.fetch_multireddit_rss("LocalLLaMA+artificial", limit=5))
        assert len(results) == 1
        item = results[0]
        assert item["title"] == "DeepSeek R1 local inference on a laptop"
        assert item["platform"] == "reddit"
        assert item["subreddit"] == "LocalLLaMA"
        assert item["query"] == item["title"]
        assert "reddit.com" in item["url"]
        assert item["breakout"] is True


def test_fetch_signals_orchestrator_dedup():
    multi = [{"title": "DeepSeek R1 Architecture", "platform": "reddit", "url": "https://reddit.com/1", "upvotes": 800, "comments": 200, "query": "x", "subreddit": "LocalLLaMA"}]
    search = [{"title": "DeepSeek R1 Architecture", "platform": "reddit", "url": "https://reddit.com/1", "upvotes": 800, "comments": 200, "query": "x", "subreddit": "reddit"}]

    with patch.object(RedditScraperEngine, "fetch_multireddit_rss", new=AsyncMock(return_value=multi)), \
         patch.object(RedditScraperEngine, "fetch_search_rss", new=AsyncMock(return_value=search)):
        signals = _run(RedditScraperEngine.fetch_signals("IT, Программирование", lang="en", limit=15))
        # Дубликаты по заголовку схлопываются
        assert len(signals) == 1
        assert signals[0]["title"] == "DeepSeek R1 Architecture"


def test_guest_oauth_token_and_fallback():
    RedditScraperEngine._guest_token = None
    RedditScraperEngine._guest_token_expiry = 0.0

    mock_auth_resp = MagicMock()
    mock_auth_resp.status_code = 200
    mock_auth_resp.json.return_value = {"access_token": "mock_guest_token_999", "expires_in": 3600}

    with patch("app.infrastructure.youtube.http_client.DeepTrendHTTPPool.get_client", new_callable=AsyncMock) as mock_get:
        mock_client = AsyncMock()
        mock_client.post.return_value = mock_auth_resp
        mock_get.return_value = mock_client

        token = _run(RedditScraperEngine.get_guest_token())
        assert token == "mock_guest_token_999"


def test_comment_thread_mining():
    mock_comments_payload = {
        "data": [
            {"author": "DevPro", "body": "Why did you skip memory limits on Windows?", "score": 85},
            {"author": "AutoBot", "body": "[deleted]", "score": 0},
            {"author": "User2", "body": "This fixed my error 127!", "score": 40},
        ]
    }
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = mock_comments_payload

    with patch("app.infrastructure.youtube.http_client.DeepTrendHTTPPool.get_client", new_callable=AsyncMock) as mock_get:
        mock_client = AsyncMock()
        mock_client.get.return_value = mock_resp
        mock_get.return_value = mock_client

        comments = _run(RedditScraperEngine.fetch_thread_comments("https://reddit.com/comments/abc1234"))
        assert len(comments) == 2  # [deleted] отфильтрован
        assert comments[0]["author"] == "DevPro"
        assert comments[0]["likes"] == 85
        assert comments[1]["likes"] == 40


def test_reddit_ingestor_no_empty_cache():
    DeepTrendCircuitCache.clear_all()
    sig = {
        "title": "Local LLM trend", "query": "Local LLM trend", "platform": "reddit",
        "url": "https://reddit.com/1", "upvotes": 700, "comments": 150, "subreddit": "LocalLLaMA",
    }
    # Непустой результат кэшируется: второй вызов не идет в сеть
    with patch.object(RedditScraperEngine, "fetch_signals", new=AsyncMock(return_value=[sig])) as m:
        r1 = _run(RedditIngestor.fetch_signals("AI agents", lang="en"))
        r2 = _run(RedditIngestor.fetch_signals("AI agents", lang="en"))
        assert len(r1) == 1 and len(r2) == 1
        assert m.await_count == 1

    # Пустой результат НЕ кэшируется: каждый вызов опрашивает источники заново
    with patch.object(RedditScraperEngine, "fetch_signals", new=AsyncMock(return_value=[])) as m2:
        _run(RedditIngestor.fetch_signals("Empty niche", lang="en"))
        _run(RedditIngestor.fetch_signals("Empty niche", lang="en"))
        assert m2.await_count == 2


def test_comment_goldmine_reddit_post_extraction():
    # Reddit-пост без комментариев -> пустой отчёт, без сетевых вызовов LLM
    with patch.object(RedditScraperEngine, "fetch_thread_comments", new=AsyncMock(return_value=[])):
        report = _run(CommentGoldmineExtractor.extract_goldmine_from_reddit_post(
            "https://reddit.com/comments/abc1234", "Local LLMs"
        ))
        assert report.script_counter_theses == []
