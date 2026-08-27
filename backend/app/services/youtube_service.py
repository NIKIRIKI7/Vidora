"""Сервис YouTube исследований, потокового поиска трендов и генерации сценариев."""

import os
import json
import asyncio
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Dict, List, Optional

from app.domain.schemas.youtube import (
    AgentReq,
    AnalyzeChannelReq,
    BlueOceanOpportunity,
    CommentsReq,
    DraftReq,
    EarlySignalItem,
    HookReq,
    PromptReq,
    SuggestCompetitorsReq,
)
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.storage.path_resolver import PathResolver
from app.infrastructure.youtube.blue_ocean_detector import BlueOceanDetector
from app.infrastructure.youtube.exporter import YouTubeExporter
from app.infrastructure.youtube.metadata_downloader import YouTubeMetadataDownloader
from app.infrastructure.youtube.comment_goldmine import CommentGoldmineExtractor
from app.infrastructure.youtube.engine_resolver import resolve_youtube_engine
from app.infrastructure.youtube.momentum_engine import MomentumEngine
from app.infrastructure.youtube.normalizer import normalize_language_code, parse_published_to_hours
from app.infrastructure.youtube.prompts import (
    HOOK_ANALYZER_SYSTEM_PROMPT_EN,
    HOOK_ANALYZER_SYSTEM_PROMPT_RU,
    LOCAL_VOICE_RULES,
    MINIMAX_VOICE_RULES,
    SCRIPTWRITER_SYSTEM_PROMPT,
    VIRAL_IDEAS_AGENT_PROMPT_EN,
    VIRAL_IDEAS_AGENT_PROMPT_RU,
)
from app.infrastructure.youtube.scraper import YtScrapeService
from app.infrastructure.youtube.searcher import YouTubeSearcher
from app.infrastructure.youtube.thumbnail_engine import ThumbnailPromptEngine
from app.infrastructure.youtube.trend_analyzer import AIKeywordExpander, TrendAnalyzer


class YouTubeService:
    def __init__(self, llm_gateway: Optional[LLMGateway] = None):
        self.llm_gateway = llm_gateway or LLMGateway()
        self.thumb_engine = ThumbnailPromptEngine()

    @staticmethod
    def _extract_json(raw_text: str) -> Dict[str, Any]:
        clean = (raw_text or "").strip()
        if "```json" in clean:
            clean = clean.split("```json", 1)[1].split("```", 1)[0]
        elif "```" in clean:
            clean = clean.split("```", 1)[1].split("```", 1)[0]
        start = clean.find("{")
        end = clean.rfind("}")
        if start != -1 and end > start:
            clean = clean[start : end + 1]
        try:
            return json.loads(clean.strip())
        except Exception:
            return {}

    async def search_ideas(
        self,
        query: str,
        days_back: int = 30,
        min_subs: int = 1000,
        max_subs: int = 100000,
        min_ratio: float = 1.0,
        language: str = "ru",
        api_key: str = "",
    ) -> List[Dict[str, Any]]:
        lang_code, _, _ = normalize_language_code(language)
        return await YouTubeSearcher.search_viral_videos(
            queries=[query],
            days_back=days_back,
            min_subs=min_subs,
            max_subs=max_subs,
            min_ratio=min_ratio,
            api_key=api_key or os.environ.get("YOUTUBE_API_KEY", ""),
            language=lang_code,
        )

    async def get_video_comments(self, req: CommentsReq) -> List[Dict[str, Any]]:
        return await YtScrapeService.get_comments(req.video_id, req.max_comments)

    async def suggest_competitors(self, req: SuggestCompetitorsReq) -> Dict[str, Any]:
        lang_code, _, lang_name = normalize_language_code(req.language or "en")
        engine, _ = resolve_youtube_engine(req.engine, req.api_keys)
        gateway = LLMGateway(req.api_keys)
        prompt = (
            f"You are a YouTube niche expert. Suggest the top 10 most relevant, active competitor channels in niche: '{req.niche}' ({lang_name}). "
            f"Return ONLY valid JSON: {{\"channels\": [\"ChannelName1\", \"ChannelName2\"]}}."
        )
        if req.skills_text:
            prompt += f"\n\n{req.skills_text}"

        try:
            res = await gateway.generate_text(prompt=prompt, engine=engine, json_mode=True, max_tokens=300)
            return self._extract_json(res)
        except Exception:
            return {"channels": []}

    async def analyze_hook(self, req: HookReq) -> Dict[str, Any]:
        lang_code, _, lang_name = normalize_language_code(req.language or "ru")
        engine, _ = resolve_youtube_engine(req.engine, req.api_keys)
        gateway = LLMGateway(req.api_keys)
        sample = " ".join(req.transcript.split()[:250])

        system_prompt = HOOK_ANALYZER_SYSTEM_PROMPT_EN if lang_code == "en" else HOOK_ANALYZER_SYSTEM_PROMPT_RU
        user_prompt = f"Transcript Opening (first 30-45s):\n{sample}\nTarget Language: {lang_name}"
        if req.skills_text:
            user_prompt += f"\n\nContext:\n{req.skills_text}"

        try:
            res = await gateway.generate_text(
                prompt=user_prompt,
                system_prompt=system_prompt,
                engine=engine,
                json_mode=True,
                max_tokens=1200,
            )
            return self._extract_json(res) or {
                "original_hook": sample, "psychology": "Анализ завершен", "stolen_hooks": []
            }
        except Exception as e:
            return {"original_hook": sample, "psychology": f"LLM Error: {e}", "stolen_hooks": []}

    async def draft_script(self, req: DraftReq) -> str:
        """Генерация сценария строго на выбранном языке с динамическим разрешением LLM-движка."""
        lang_code, _, lang_name = normalize_language_code(req.language or (req.api_keys or {}).get("language") or "ru")
        engine, is_cloud = resolve_youtube_engine(req.engine, req.api_keys)
        gateway = LLMGateway(req.api_keys)
        cur_year = datetime.now().year

        is_local = any(m in (req.audio_engine or "").lower() for m in ("omnivoice", "qwen", "moss", "silero", "fish", "s2"))
        voice_rules = LOCAL_VOICE_RULES if is_local else MINIMAX_VOICE_RULES

        target_dur_float = 3.0
        try:
            if req.target_duration:
                target_dur_float = float(req.target_duration)
        except Exception:
            pass

        words_count = int(target_dur_float * 150)
        user_prompt = (
            f"Write a comprehensive, retention-engineered YouTube script strictly in {lang_name} for: '{req.title}'.\n"
            f"Idea description & core angle: {req.idea_description}.\n"
            f"Channel context: {req.channel_context or 'Tech & Innovation Channel'}.\n"
            f"Target duration: {req.target_duration} mins (~{words_count} words).\n"
            f"Language requirement: {lang_name} ({lang_code}).\n"
            f"Current Year: {cur_year} (NEVER mention 2023, 2024, or 2025).\n"
        )
        if req.audience_comments:
            user_prompt += f"\nViewer pain points from real comments:\n{req.audience_comments}\n"
        if req.custom_prompt:
            user_prompt = f"{req.custom_prompt}\n\nTitle: {req.title}\nLanguage: {lang_name}"

        system_prompt = SCRIPTWRITER_SYSTEM_PROMPT.replace("{{VOICE_RULES}}", voice_rules).replace(
            "{{LANGUAGE}}", lang_name
        ).replace("{CUR_YEAR}", str(cur_year))

        try:
            raw_script = await gateway.generate_text(
                prompt=user_prompt, system_prompt=system_prompt, engine=engine, max_tokens=3500
            )
            return AIKeywordExpander.sanitize_temporal_references(raw_script, cur_year)
        except Exception:
            if is_cloud:
                local_engine, _ = resolve_youtube_engine("gemma3:4b", {})
                raw_script = await gateway.generate_text(
                    prompt=user_prompt, system_prompt=system_prompt, engine=local_engine, max_tokens=3500
                )
                return AIKeywordExpander.sanitize_temporal_references(raw_script, cur_year)
            raise

    async def generate_thumbnail_prompt(self, req: PromptReq) -> Dict[str, Any]:
        engine, _ = resolve_youtube_engine(req.engine, req.api_keys)
        return await self.thumb_engine.generate_concept(
            req.video_title, req.transcript, engine, req.api_keys
        )

    async def analyze_channel(self, req: AnalyzeChannelReq) -> Dict[str, Any]:
        query = req.url_or_name.strip()
        lang_code, _, lang_name = normalize_language_code(req.language or "en")
        engine, _ = resolve_youtube_engine(req.engine, req.api_keys)
        gateway = LLMGateway(req.api_keys)

        if YtScrapeService.is_available():
            try:
                ch_info = await YtScrapeService.get_channel_info(query, language=lang_code)
                desc = ch_info.get("description", "")
                vids = ch_info.get("videos", [])
                vids_text = "\n".join([f"- {v['title']}" for v in vids[:15]])
                if desc or vids_text:
                    prompt = (
                        f"Analyze the channel description and latest video titles in {lang_name}:\n"
                        f"Description:\n{desc}\n\nVideos:\n{vids_text}\n\n"
                        f"Write 2-3 concise sentences explaining the channel core theme and target audience in {lang_name}."
                    )
                    res = await gateway.generate_text(prompt, system_prompt="You are a YouTube strategist.", engine=engine, max_tokens=300)
                    return {"context": res.strip()}
            except Exception:
                pass

        return {"context": f"Channel: {query}. Detailed stats available upon video lookup."}

    async def download_metadata(self, video_url: str, output_dir: str, lang: str = "ru") -> Dict[str, Any]:
        lang_code, _, _ = normalize_language_code(lang)
        return await YouTubeMetadataDownloader.download(
            video_url, output_dir, lang_code, enable_whisper_fallback=True
        )

    async def stream_agent_ideas(self, req: AgentReq) -> AsyncGenerator[str, None]:
        """5-этапный потоковый пайплайн DeepTrend 2.0:
        early_signals_ready -> videos_ready -> excel_ready -> done."""
        def _log(msg: str, status: str = "info") -> str:
            return json.dumps({"type": "log", "message": msg, "status": status}) + "\n"

        gateway = LLMGateway(req.api_keys)
        cur_year = datetime.now().year
        lang_code, region, lang_name = normalize_language_code(
            req.settings.get("language") or req.settings.get("lang") or "ru"
        )
        engine, is_cloud = resolve_youtube_engine(
            req.llm_engine or req.settings.get("llm_engine"), req.api_keys
        )
        engine_label = "Облако" if is_cloud else "Локальный GGUF"
        days_back = int(req.settings.get("days_back") or 7)
        min_subs = int(req.settings.get("min_subs") or 1000)
        max_subs = int(req.settings.get("max_subs") or 90000)
        min_ratio = float(req.settings.get("min_ratio") or 1.5)
        video_type = str(req.settings.get("video_type") or "all")
        search_mode = req.settings.get("search_mode", "trending")
        channel_context = req.settings.get("channel_context", "")
        enable_whisper = req.settings.get("enable_whisper_fallback", True)

        yield _log(f"🚀 Запуск Vidora DeepTrend 2.0 [{lang_name} ({region})] | AI: {engine} ({engine_label}) | {cur_year} год")

        # ---------------------------------------------------------
        # ЭТАП 0: Фоновый сбор ранних сигналов (VPS) — параллельно с ИИ-генерацией семантики
        # ---------------------------------------------------------
        early_signals_task = None
        if search_mode != "competitors":
            sources_label = "Reddit + HackerNews + GitHub + Trends" if lang_code == "en" else "Reddit + Habr + HackerNews + GitHub + Trends"
            yield _log(f"📡 Фоновый сбор сигналов ({sources_label}) по теме '{req.query}'...", "info")
            early_signals_task = asyncio.create_task(
                TrendAnalyzer.get_early_signals(
                    req.query, lang=lang_code, engine=engine, api_keys=req.api_keys
                )
            )

        # ---------------------------------------------------------
        # ЭТАП 1: ИИ-генерация поисковой семантики + LSI
        # ---------------------------------------------------------
        yield _log(f"🧠 ИИ-генерация поисковых запросов и LSI через {engine} для '{req.query}' на {lang_name}...", "info")
        ai_queries = await AIKeywordExpander.expand_topic_with_ai(
            req.query, lang=lang_code, engine=engine, api_keys=req.api_keys
        )
        yield _log(f"💡 ИИ сгенерировал {len(ai_queries)} ключевых веток: {', '.join(ai_queries[:3])}", "info")

        early_signals: List[EarlySignalItem] = []
        if early_signals_task:
            try:
                early_signals = await early_signals_task
                top_vps = early_signals[0].vps_score if early_signals else 0
                yield _log(f"🔥 Найдено {len(early_signals)} ранних трендов (Топ VPS: {top_vps}/100)", "success")
                yield json.dumps({
                    "type": "early_signals_ready",
                    "signals": [s.model_dump() for s in early_signals]
                }) + "\n"
            except Exception:
                early_signals = []

        # ---------------------------------------------------------
        # ЭТАП 3: Быстрый поиск YouTube-аномалий (Fast-Reject) + конвейерный Whisper
        # ---------------------------------------------------------
        # Pipelined Eager Execution: как только найден ролик Ratio >= min_ratio,
        # скачивание аудио в RAM и Faster-Whisper стартуют фоном, пока поиск
        # продолжает опрашивать остальные каналы. К финалу поиска транскрипты готовы.
        eager_whisper_tasks: Dict[str, asyncio.Task] = {}

        def _on_candidate_eager(candidate: Dict[str, Any]):
            v_id = candidate["video_id"]
            if v_id in eager_whisper_tasks or len(eager_whisper_tasks) >= 4:
                return
            eager_whisper_tasks[v_id] = asyncio.create_task(
                YouTubeMetadataDownloader.download(
                    candidate["url"],
                    output_dir=str(Path(req.project_path) / "assets" / "refs"),
                    lang=lang_code,
                    enable_whisper_fallback=enable_whisper,
                )
            )

        raw_videos: List[Dict[str, Any]] = []
        if search_mode == "competitors":
            channels = req.settings.get("channels", [])
            if not channels:
                yield _log("❌ Список каналов пуст.", "error")
                yield json.dumps({"type": "done", "analysis": {}}) + "\n"
                return
            yield _log(f"🕵️ Анализ ленты последних релизов {len(channels)} конкурентов...")
            raw_videos = await YouTubeSearcher.search_channel_outliers(
                channels=channels, days_back=days_back, min_ratio=min_ratio,
                api_key=req.youtube_key or "", video_type=video_type
            )
        else:
            base_queries = list(dict.fromkeys(ai_queries + [s.query for s in early_signals[:4]]))
            yield _log(f"⚡ Сканирование YouTube [{lang_name}] (Fast-Reject views/subs >= x{min_ratio}, конвейерный Whisper)...", "info")
            raw_videos = await YouTubeSearcher.search_viral_videos(
                queries=base_queries, days_back=days_back, min_subs=min_subs, max_subs=max_subs,
                min_ratio=min_ratio, api_key=req.youtube_key or "", language=lang_code, video_type=video_type,
                on_candidate_found=_on_candidate_eager,
            )

        if not raw_videos:
            yield _log(f"⚠️ Нет подтвержденных аномалий Ratio >= x{min_ratio}. Снижаем порог до x1.1...", "warning")
            raw_videos = await YouTubeSearcher.search_viral_videos(
                queries=ai_queries[:2] or [req.query], days_back=days_back, min_subs=min_subs, max_subs=max_subs,
                min_ratio=1.1, api_key=req.youtube_key or "", language=lang_code, video_type=video_type,
                on_candidate_found=_on_candidate_eager,
            )

        if not raw_videos:
            yield _log("❌ Аномальных видео не обнаружено.", "error")
            yield json.dumps({"type": "done", "analysis": {}}) + "\n"
            return

        # Привязываем VPS из совпавших ранних сигналов
        if early_signals:
            sig_by_query = {s.query.lower(): s for s in early_signals}
            for v in raw_videos:
                sig = sig_by_query.get((v.get("keyword_found") or "").lower())
                if sig:
                    v["vps_score"] = sig.vps_score
                    v["social_source_url"] = sig.source_url

        # ---------------------------------------------------------
        # ЭТАП 3.1: Momentum Velocity (M-Score) — динамическая производная вирусности
        # ---------------------------------------------------------
        for vid in raw_videos:
            hours_alive = parse_published_to_hours(vid.get("published_at", ""))
            momentum = MomentumEngine.calculate_momentum(
                views=vid.get("views", 0),
                hours_alive=hours_alive,
                likes=int(vid.get("views", 0) * 0.04),  # оценка без API-данных о лайках
                comments=int(vid.get("views", 0) * 0.005),
                ratio=vid.get("ratio", 1.0),
            )
            vid["m_score"] = momentum.m_score
            vid["velocity_stage"] = momentum.velocity_stage
            vid["acceleration_pct"] = momentum.acceleration_pct
            vid["is_rocket"] = momentum.is_rocket
            vid["engagement_multiplier"] = momentum.engagement_multiplier

        # Ролики-ракеты поднимаются на самый верх выдачи
        raw_videos.sort(key=lambda x: (x.get("is_rocket", False), x.get("m_score", 0)), reverse=True)

        top_m = raw_videos[0].get("m_score", 0)
        yield _log(f"🎯 Найдено {len(raw_videos)} подтвержденных YouTube-аномалий (Топ M-Score: {top_m})!", "success")
        yield json.dumps({"type": "videos_ready", "results": raw_videos}) + "\n"

        # ---------------------------------------------------------
        # ЭТАП 3.2: Детекция Голубых Океанов (Semantic Gap Search)
        # ---------------------------------------------------------
        blue_ocean_gaps: List[BlueOceanOpportunity] = []
        if early_signals and raw_videos:
            blue_ocean_gaps = await BlueOceanDetector.detect_gaps(
                demand_signals=[s.model_dump() for s in early_signals],
                youtube_videos=raw_videos,
                lang=lang_code,
            )
            if blue_ocean_gaps:
                uncontested = len([g for g in blue_ocean_gaps if g.status == "BLUE_OCEAN_UNCONTESTED"])
                yield _log(f"💎 Обнаружено {uncontested} Голубых Океанов без конкуренции на YouTube!", "success")
                yield json.dumps({
                    "type": "blue_ocean_ready",
                    "opportunities": [g.model_dump() for g in blue_ocean_gaps]
                }) + "\n"

        # ---------------------------------------------------------
        # ЭТАП 4: Майнинг ПОЛНЫХ транскриптов, комментариев, Whisper Fallback и Comment Goldmine
        # ---------------------------------------------------------
        yield _log("💬 Извлечение полных транскриптов, топ-комментариев и Comment Goldmine...", "info")
        goldmine_entries: List[Dict[str, Any]] = []
        all_counter_theses: List[str] = []

        for vid in raw_videos[:4]:
            try:
                meta_task = eager_whisper_tasks.get(vid["video_id"])
                if meta_task is None:
                    meta_task = asyncio.create_task(
                        YouTubeMetadataDownloader.download(
                            vid["url"],
                            output_dir=str(Path(req.project_path) / "assets" / "refs"),
                            lang=lang_code,
                            enable_whisper_fallback=enable_whisper,
                        )
                    )
                meta = await meta_task
                vid["transcript_sample"] = meta.get("transcript_sample", "")
                vid["transcript_status"] = meta.get("transcript_status", "none")
                vid["comments_summary"] = meta.get("comments_summary", "")

                if vid["transcript_status"] == "whisper_fallback":
                    yield _log(f"🎙️ Полный транскрипт извлечен через Whisper Fallback для '{vid['title'][:35]}...'", "info")
                elif vid["transcript_status"] == "official_subtitles":
                    yield _log(f"📝 Получены официальные субтитры для '{vid['title'][:35]}...'", "info")

                top_comments = meta.get("top_comments") or []
                if top_comments:
                    goldmine = await CommentGoldmineExtractor.extract_goldmine(
                        raw_comments=top_comments,
                        video_title=vid["title"],
                        lang=lang_code,
                        engine=engine,
                        api_keys=req.api_keys,
                    )
                    goldmine_entries.append({
                        "video_title": vid["title"],
                        "report": goldmine.model_dump(),
                    })
                    all_counter_theses.extend(goldmine.script_counter_theses)
            except Exception:
                pass

        if goldmine_entries:
            yield _log(f"💎 Comment Goldmine: извлечено {len(all_counter_theses)} острых тезисов и болей аудитории!", "success")
            yield json.dumps({
                "type": "comment_goldmine_ready",
                "reports": goldmine_entries
            }) + "\n"

        proj_path = PathResolver.resolve(req.project_path) or Path(req.project_path)
        excel_path = await asyncio.to_thread(YouTubeExporter.to_excel, raw_videos, str(proj_path))
        yield json.dumps({"type": "excel_ready", "excel_path": excel_path}) + "\n"

        # ---------------------------------------------------------
        # ЭТАП 5: Master Viral Engine — психографика, 3 CTR-пакета, 45с интро, SEO
        # ---------------------------------------------------------
        yield _log(f"🧠 Мастер-синтез через {engine} ({engine_label}) на {lang_name} ({cur_year} год)...", "info")

        prompt_template = VIRAL_IDEAS_AGENT_PROMPT_EN if lang_code == "en" else VIRAL_IDEAS_AGENT_PROMPT_RU
        # ponytail: промпты содержат JSON с одинарными {} — только .replace, .format() упадёт.
        system_prompt = (
            prompt_template
            .replace("{CUR_YEAR}", str(cur_year))
            .replace(
                "{channel_context}",
                channel_context or ("Tech & AI channel" if lang_code == "en" else "Технологический канал"),
            )
        )

        videos_context = "\n\n".join([
            f"--- VIDEO: {v['title']} (Ratio: x{v['ratio']}, VPH: {v['vph']}, Momentum M: {v.get('m_score')}, Subs: {v['subs']}) ---\n"
            f"Full Transcript Sample ({v.get('transcript_status', 'none')}):\n{(v.get('transcript_sample') or '')[:1000]}...\n"
            f"Audience Pain Points & Debates in Comments:\n{v.get('comments_summary') or 'No comments'}"
            for v in raw_videos[:3]
        ])

        if blue_ocean_gaps:
            uncontested = [g for g in blue_ocean_gaps if g.status == "BLUE_OCEAN_UNCONTESTED"]
            if uncontested:
                gaps_block = "\n".join([
                    f"• 💎 UNCONTESTED TOPIC: {g.topic} (Opp. Score: {g.opportunity_score}/100, Angle: {g.actionable_angle})"
                    for g in uncontested[:3]
                ])
                videos_context += f"\n\n=== BLUE OCEAN GAPS (ZERO YOUTUBE COVERAGE) ===\n{gaps_block}"

        if early_signals:
            signals_context = "\n".join([
                f"• TREND: {s.title} (VPS: {s.vps_score}/100, Demand: {s.demand_score}, Platform: {s.source_platform}, URL: {s.source_url})"
                for s in early_signals[:4]
            ])
            videos_context = f"=== EARLY DEMAND & SOCIAL SIGNALS (Reddit/HN/GitHub/Habr/Trends) ===\n{signals_context}\n\n=== CONFIRMED OUTLIER VIDEOS ===\n{videos_context}"

        if all_counter_theses:
            theses_block = "\n".join([f"• {t}" for t in all_counter_theses[:6]])
            videos_context += f"\n\n=== EXTRACTED COMMENT GOLDMINE THESES (MUST RESOLVE IN SCRIPT) ===\n{theses_block}"

        analysis_data: Dict[str, Any] = {}
        try:
            llm_res = await gateway.generate_text(
                prompt=videos_context,
                system_prompt=system_prompt,
                engine=engine,
                json_mode=True,
                max_tokens=4000,
            )
            # Санитизация случайных упоминаний устаревших годов (2020-2025 -> cur_year)
            clean_res = AIKeywordExpander.sanitize_temporal_references(llm_res or "", cur_year)
            analysis_data = self._extract_json(clean_res)
            analysis_data["blue_ocean_gaps"] = [g.model_dump() for g in blue_ocean_gaps]
            analysis_data["comment_goldmine"] = goldmine_entries
            yield _log(f"✅ Готово! Пакеты идей, 45с скрипт и SEO на {cur_year} год сгенерированы.", "success")
        except Exception as e:
            yield _log(f"⚠️ Сбой генерации через LLM ({e}), применен резервный шаблон {cur_year}", "warning")
            analysis_data = {
                "psychology": {
                    "viewer_fear": f"Fear of being left behind by {cur_year} technology shifts",
                    "viewer_aspiration": "Mastering the tool with minimal wasted effort",
                    "skepticism_barrier": "Competitors give surface-level theory without real benchmarks"
                },
                "ideas": [
                    {
                        "concept_id": "A",
                        "angle_type": "Contrarian",
                        "titles": [v["title"] for v in raw_videos[:2]],
                        "thumbnail_visual": "High contrast split scene with bold visual proof",
                        "thumbnail_overlay": "DON'T USE THIS",
                        "description": "Analysis generated from breakout search demand and outlier metrics.",
                        "psychological_hook": "Why does everyone misunderstand this critical feature?"
                    }
                ],
                "best_concept_script": {
                    "concept_id": "A",
                    "hook_0_5s": {
                        "spoken": "Stop using this tool the way everyone taught you.",
                        "visual_cues": "Direct camera zoom with red error cross overlay."
                    },
                    "stakes_5_20s": {
                        "spoken": "90% of developers lose hours each week because of one hidden setting.",
                        "visual_cues": "Fast screen recording showing failed execution and wasted time."
                    },
                    "open_loop_20_45s": {
                        "spoken": "In this video, I will show you the exact 3-step fix that changed everything.",
                        "visual_cues": "On-screen workflow demonstration with blurred final result."
                    }
                },
                "seo": {
                    "primary_keyword": req.query,
                    "description_above_fold": f"Everything you need to know about {req.query}. Avoid the common mistakes.",
                    "description_body": f"Complete guide and real-world benchmark for {req.query}.",
                    "timestamps": [
                        {"time": "0:00", "label": "Introduction"},
                        {"time": "1:00", "label": "The Core Problem"}
                    ],
                    "tags": [req.query, "tutorial", "guide"],
                    "pinned_comment": "Which method do you currently use? Drop your thoughts below! #tech #tutorial"
                },
                "blue_ocean_gaps": [g.model_dump() for g in blue_ocean_gaps],
                "comment_goldmine": goldmine_entries,
                "conclusions": ["Focus on breakout community discussions and high-VPH topics"],
                "debug_notes": ["Generated via fallback template due to LLM timeout"]
            }

        yield json.dumps({"type": "done", "analysis": analysis_data}) + "\n"
