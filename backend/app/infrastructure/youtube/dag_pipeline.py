"""Реактивный конвейер DeepTrend DAG: потоковый анализ виральности с TTFB < 500 мс.

Node 1: сигналы спроса (Reddit/HN/GitHub/Trends)
Node 2: YouTube Fast-Reject поиск с адаптивным расширением окна
Node 3: Fast-Track субтитры (Innertube -> Whisper Head-90s) + Comment Goldmine
Node 4: Детекция Голубых Океанов 3.0
"""

import asyncio
import json
from typing import Any, AsyncGenerator, Dict, List, Optional, Set

from app.domain.schemas.youtube import AgentReq, BlueOceanOpportunity, EarlySignalItem
from app.infrastructure.youtube.blue_ocean_detector import BlueOceanDetector
from app.infrastructure.youtube.comment_goldmine import CommentGoldmineExtractor
from app.infrastructure.youtube.momentum_engine import MomentumEngine
from app.infrastructure.youtube.normalizer import parse_published_to_hours
from app.infrastructure.youtube.scraper import YtScrapeService
from app.infrastructure.youtube.searcher import YouTubeSearcher
from app.infrastructure.youtube.signal_ingestor import SignalIngestor
from app.infrastructure.youtube.trend_analyzer import AIKeywordExpander
from app.infrastructure.youtube.whisper_transcriber import WhisperTranscriber


class DeepTrendDAGPipeline:
    def __init__(self, req: AgentReq, cancel_event: Optional[asyncio.Event] = None):
        self.req = req
        self.cancel_event = cancel_event or asyncio.Event()
        self.event_queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue(maxsize=100)

        self.discovered_videos: List[Dict[str, Any]] = []
        self.seen_video_ids: Set[str] = set()
        self.early_signals: List[EarlySignalItem] = []
        self.blue_ocean_gaps: List[BlueOceanOpportunity] = []
        self.goldmine_entries: List[Dict[str, Any]] = []
        self.all_counter_theses: List[str] = []

        self._quorum_event = asyncio.Event()
        self._all_searches_done = asyncio.Event()
        self._enrichment_done = asyncio.Event()

    async def emit_log(self, message: str, status: str = "info") -> None:
        await self.event_queue.put({"type": "log", "message": message, "status": status})

    async def emit_event(self, event_type: str, payload_key: str, data: Any) -> None:
        await self.event_queue.put({"type": event_type, payload_key: data})

    def is_cancelled(self) -> bool:
        return self.cancel_event.is_set()

    async def _signals_worker(self, lang_code: str, engine: str) -> None:
        if self.is_cancelled():
            return
        await self.emit_log("📡 Сбор сигналов спроса (Reddit / HN / Trends / GitHub)...")
        try:
            signals = await SignalIngestor.collect_early_signals(self.req.query, lang=lang_code)
            if not self.is_cancelled() and signals:
                self.early_signals = signals
                await self.emit_event(
                    "early_signals_ready",
                    "signals",
                    [s.model_dump() for s in signals],
                )
                await self.emit_log(
                    f"🔥 Найдено {len(signals)} ранних трендов (Топ VPS: {signals[0].vps_score}/100)",
                    "success",
                )
        except Exception as e:
            await self.emit_log(f"⚠️ Ошибка сбора сигналов: {e}", "warning")

    async def _youtube_search_worker(
        self,
        base_queries: List[str],
        days_back: int,
        min_subs: int,
        max_subs: int,
        min_ratio: float,
        lang_code: str,
        video_type: str,
    ) -> None:
        def _on_candidate_found(video_item: Dict[str, Any]):
            if self.is_cancelled():
                return
            v_id = video_item["video_id"]
            if v_id in self.seen_video_ids:
                return
            self.seen_video_ids.add(v_id)

            hours_alive = parse_published_to_hours(video_item.get("published_at", ""))
            momentum = MomentumEngine.calculate_momentum(
                views=video_item.get("views", 0),
                hours_alive=hours_alive,
                likes=int(video_item.get("views", 0) * 0.04),
                comments=int(video_item.get("views", 0) * 0.005),
                ratio=video_item.get("ratio", 1.0),
            )
            video_item["m_score"] = momentum.m_score
            video_item["velocity_stage"] = momentum.velocity_stage
            video_item["acceleration_pct"] = momentum.acceleration_pct
            video_item["is_rocket"] = momentum.is_rocket
            video_item["engagement_multiplier"] = momentum.engagement_multiplier

            self.discovered_videos.append(video_item)

            # Быстрый эмит единичной карточки (< 500 мс)
            asyncio.create_task(
                self.emit_event("single_video_found", "video", video_item)
            )

            if len(self.discovered_videos) >= 3:
                self._quorum_event.set()

        try:
            # 1. Проход с базовыми параметрами
            await YouTubeSearcher.search_viral_videos(
                queries=base_queries,
                days_back=days_back,
                min_subs=min_subs,
                max_subs=max_subs,
                min_ratio=min_ratio,
                api_key=self.req.youtube_key or "",
                language=lang_code,
                video_type=video_type,
                on_candidate_found=_on_candidate_found,
            )

            # 2. Адаптивное расширение (если при строгих фильтрах найдено 0 роликов)
            if len(self.discovered_videos) == 0 and not self.is_cancelled():
                await self.emit_log(
                    f"⚠️ Нет аномалий за {days_back} дн. Расширяем диапазон до 30 дн. и подключаем темы сигналов...",
                    "warning",
                )
                signal_topics = [s.title[:50] for s in self.early_signals[:3]] if self.early_signals else []
                expanded_queries = list(dict.fromkeys(base_queries + signal_topics))

                await YouTubeSearcher.search_viral_videos(
                    queries=expanded_queries,
                    days_back=max(days_back * 4, 30),
                    min_subs=min_subs,
                    max_subs=max(max_subs * 3, 300000),
                    min_ratio=1.0,
                    api_key=self.req.youtube_key or "",
                    language=lang_code,
                    video_type=video_type,
                    on_candidate_found=_on_candidate_found,
                )
        except Exception as e:
            await self.emit_log(f"⚠️ Сбой поиска YouTube: {e}", "warning")
        finally:
            self._all_searches_done.set()
            self._quorum_event.set()

            # videos_ready (полный массив) для фронтенда YoutubeIdeasView.tsx
            if self.discovered_videos:
                self.discovered_videos.sort(
                    key=lambda x: (x.get("is_rocket", False), x.get("m_score", 0)),
                    reverse=True,
                )
                await self.emit_event("videos_ready", "results", self.discovered_videos)
                top_m = self.discovered_videos[0].get("m_score", 0)
                await self.emit_log(
                    f"🎯 Найдено {len(self.discovered_videos)} YouTube-аномалий (Топ M-Score: {top_m})!",
                    "success",
                )

    async def _enrichment_worker(self, lang_code: str, engine: str) -> None:
        """Извлекает субтитры и проводит Comment Goldmine для топ-роликов."""
        try:
            # Ждем завершения поиска; если роликов нет — выходим (без вечного цикла)
            while not self._all_searches_done.is_set():
                if self.is_cancelled():
                    return
                await asyncio.sleep(0.1)

            if not self.discovered_videos:
                return

            top_candidates = self.discovered_videos[:4]
            for vid in top_candidates:
                if self.is_cancelled():
                    break

                transcript, source = await WhisperTranscriber.transcribe_head_fast_track(
                    vid["video_id"], lang=lang_code
                )
                vid["transcript_sample"] = transcript[:3000]
                vid["transcript_status"] = source

                try:
                    comments = await YtScrapeService.get_comments(vid["video_id"], max_comments=15)
                    vid["top_comments"] = comments
                    vid["comments_summary"] = "\n".join(
                        [f"- {c['author']} (👍 {c['likes']}): {c['text']}" for c in comments[:8]]
                    )
                    if comments:
                        goldmine = await CommentGoldmineExtractor.extract_goldmine(
                            raw_comments=comments,
                            video_title=vid["title"],
                            lang=lang_code,
                            engine=engine,
                            api_keys=self.req.api_keys,
                        )
                        self.goldmine_entries.append({
                            "video_title": vid["title"],
                            "report": goldmine.model_dump(),
                        })
                        self.all_counter_theses.extend(goldmine.script_counter_theses)
                except Exception:
                    pass

            if self.goldmine_entries:
                await self.emit_log(
                    f"💎 Comment Goldmine: извлечено {len(self.all_counter_theses)} тезисов аудитории!",
                    "success",
                )
                await self.emit_event(
                    "comment_goldmine_ready", "reports", self.goldmine_entries
                )
        finally:
            self._enrichment_done.set()

    async def execute_dag(
        self, lang_code: str, region: str, lang_name: str, engine: str
    ) -> AsyncGenerator[str, None]:
        days_back = int(self.req.settings.get("days_back") or 7)
        min_subs = int(self.req.settings.get("min_subs") or 1000)
        max_subs = int(self.req.settings.get("max_subs") or 90000)
        min_ratio = float(self.req.settings.get("min_ratio") or 1.5)
        video_type = str(self.req.settings.get("video_type") or "all")

        await self.emit_log(f"🚀 Запуск реактивного DAG-пайплайна Vidora [{lang_name}] | AI: {engine}")

        ai_queries = await AIKeywordExpander.expand_topic_with_ai(
            self.req.query, lang=lang_code, engine=engine, api_keys=self.req.api_keys
        )
        base_queries = list(dict.fromkeys(ai_queries + [self.req.query]))

        signals_task = asyncio.create_task(self._signals_worker(lang_code, engine))
        search_task = asyncio.create_task(
            self._youtube_search_worker(
                base_queries, days_back, min_subs, max_subs, min_ratio, lang_code, video_type
            )
        )
        enrichment_task = asyncio.create_task(self._enrichment_worker(lang_code, engine))

        try:
            async def _event_pump():
                while True:
                    try:
                        event = await asyncio.wait_for(self.event_queue.get(), timeout=0.15)
                        yield json.dumps(event, ensure_ascii=False) + "\n"
                        self.event_queue.task_done()
                    except asyncio.TimeoutError:
                        if (
                            self._all_searches_done.is_set()
                            and self._enrichment_done.is_set()
                            and self.event_queue.empty()
                        ):
                            break
                        if self.is_cancelled():
                            break

            async for raw_line in _event_pump():
                yield raw_line

            if self.early_signals or self.discovered_videos:
                self.blue_ocean_gaps = await BlueOceanDetector.detect_gaps(
                    demand_signals=[s.model_dump() for s in self.early_signals],
                    youtube_videos=self.discovered_videos,
                    lang=lang_code,
                )
                if self.blue_ocean_gaps:
                    yield json.dumps({
                        "type": "blue_ocean_ready",
                        "opportunities": [g.model_dump() for g in self.blue_ocean_gaps],
                    }) + "\n"

            await asyncio.gather(signals_task, search_task, enrichment_task, return_exceptions=True)
        finally:
            # Каскадная отмена: обрыв клиента / закрытие генератора освобождает воркеров
            for task in (signals_task, search_task, enrichment_task):
                task.cancel()
            await asyncio.gather(signals_task, search_task, enrichment_task, return_exceptions=True)
