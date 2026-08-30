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
    CommentsReq,
    DraftReq,
    HookReq,
    MoreVideosReq,
    PromptReq,
    SuggestCompetitorsReq,
)
from app.domain.skills.models import SkillStage
from app.domain.skills.prompt_builder import build_prompt_from_db_skills
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.skills.repository import SqliteSkillsRepository
from app.infrastructure.storage.path_resolver import PathResolver
from app.infrastructure.youtube.dag_pipeline import DeepTrendDAGPipeline
from app.infrastructure.youtube.engine_resolver import resolve_youtube_engine
from app.infrastructure.youtube.exporter import YouTubeExporter
from app.infrastructure.youtube.metadata_downloader import YouTubeMetadataDownloader
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
from app.infrastructure.youtube.trend_analyzer import AIKeywordExpander


class YouTubeService:
    def __init__(
        self,
        llm_gateway: Optional[LLMGateway] = None,
        skills_repo: Optional[SqliteSkillsRepository] = None,
    ):
        self.llm_gateway = llm_gateway or LLMGateway()
        self.skills_repo = skills_repo
        self.thumb_engine = ThumbnailPromptEngine()

    async def _skills_context(self, stage: SkillStage) -> str:
        """Единый источник: собирает активные скилы стадии из БД (без двойной склейки)."""
        if not self.skills_repo:
            return ""
        skills = await self.skills_repo.list_all(stage=stage, is_active=True)
        return build_prompt_from_db_skills(skills, stage=stage)

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

    async def stream_agent_ideas(self, req: AgentReq) -> AsyncGenerator[str, None]:
        """Реактивный DAG-пайплайн DeepTrend 3.0:
        single_video_found -> early_signals_ready -> videos_ready -> comment_goldmine_ready
        -> blue_ocean_ready -> excel_ready -> done."""
        lang_code, region, lang_name = normalize_language_code(
            req.settings.get("language") or req.settings.get("lang") or "ru"
        )
        engine, is_cloud = resolve_youtube_engine(
            req.llm_engine or req.settings.get("llm_engine"), req.api_keys
        )

        pipeline = DeepTrendDAGPipeline(req)

        # Стримим логи, early_signals, single_video, videos_ready, comment_goldmine, blue_ocean
        async for event_line in pipeline.execute_dag(
            lang_code=lang_code, region=region, lang_name=lang_name, engine=engine
        ):
            yield event_line

        # Экспорт в Excel
        if pipeline.discovered_videos:
            proj_path = PathResolver.resolve(req.project_path) or Path(req.project_path)
            excel_path = await asyncio.to_thread(
                YouTubeExporter.to_excel, pipeline.discovered_videos, str(proj_path)
            )
            yield json.dumps({"type": "excel_ready", "excel_path": excel_path}) + "\n"

        # Мастер-синтез с включением тезисов Comment Goldmine и Голубых Океанов
        cur_year = datetime.now().year
        prompt_template = (
            VIRAL_IDEAS_AGENT_PROMPT_EN if lang_code == "en" else VIRAL_IDEAS_AGENT_PROMPT_RU
        )
        # ponytail: промпты содержат JSON с одинарными {} — только .replace, .format() упадёт.
        system_prompt = prompt_template.replace("{CUR_YEAR}", str(cur_year)).replace(
            "{channel_context}", req.settings.get("channel_context", "Tech Channel")
        )

        videos_context = "\n\n".join([
            f"--- VIDEO: {v['title']} (Ratio: x{v['ratio']}, VPH: {v['vph']}, Momentum M: {v.get('m_score')}, Subs: {v['subs']}) ---\n"
            f"Transcript Sample: {(v.get('transcript_sample') or '')[:1000]}...\n"
            f"Comments Summary: {v.get('comments_summary') or 'No comments'}"
            for v in pipeline.discovered_videos[:3]
        ])

        if pipeline.blue_ocean_gaps:
            gaps_block = "\n".join([
                f"• {g.status}: {g.topic} (Score: {g.opportunity_score}/100, Angle: {g.actionable_angle})"
                for g in pipeline.blue_ocean_gaps[:3]
            ])
            videos_context += f"\n\n=== BLUE OCEAN GAPS ===\n{gaps_block}"

        if pipeline.all_counter_theses:
            theses_block = "\n".join([f"• {t}" for t in pipeline.all_counter_theses[:6]])
            videos_context += f"\n\n=== COMMENT GOLDMINE THESES ===\n{theses_block}"

        analysis_data: Dict[str, Any] = {}
        gateway = LLMGateway(req.api_keys)
        try:
            raw_llm = await gateway.generate_text(
                prompt=videos_context or req.query,
                system_prompt=system_prompt,
                engine=engine,
                json_mode=True,
                max_tokens=3500,
            )
            analysis_data = self._extract_json(raw_llm)
        except Exception:
            pass

        # Гарантированное наполнение идей и обложек (вкладка «Обложки» никогда не пуста)
        if not analysis_data.get("ideas"):
            sample_titles = [v["title"] for v in pipeline.discovered_videos[:3]] or [f"The Future of {req.query}"]
            analysis_data["ideas"] = [
                {
                    "concept_id": "A",
                    "angle_type": "Contrarian",
                    "titles": sample_titles,
                    "thumbnail_visual": "High-contrast split composition with error overlay and bold UI elements",
                    "thumbnail_overlay": "DON'T USE THIS",
                    "description": f"Comprehensive deep dive analyzing breakout demand on {req.query}.",
                    "psychological_hook": "Exposing the hidden flaws and revealing the faster workflow.",
                },
                {
                    "concept_id": "B",
                    "angle_type": "Transformation",
                    "titles": [f"How I Automated Everything with {req.query}", f"{req.query} in 10 Minutes"],
                    "thumbnail_visual": "Before / After transformation graph with clean terminal output",
                    "thumbnail_overlay": "10X FASTER",
                    "description": "Step-by-step implementation guide solving audience friction.",
                    "psychological_hook": "How to get 100 hours of work done in minutes.",
                },
            ]

        analysis_data["blue_ocean_gaps"] = [g.model_dump() for g in pipeline.blue_ocean_gaps]
        analysis_data["comment_goldmine"] = pipeline.goldmine_entries

        yield json.dumps({"type": "done", "analysis": analysis_data}) + "\n"

    async def search_more_videos(self, req: MoreVideosReq) -> List[Dict[str, Any]]:
        """Находит дополнительные видео-аномалии по альтернативным векторам поиска."""
        lang_code, _, _ = normalize_language_code(
            req.settings.get("language") or req.language or "en"
        )
        engine, _ = resolve_youtube_engine(req.settings.get("llm_engine"), req.api_keys)

        days_back = int(req.settings.get("days_back") or 14)
        min_subs = int(req.settings.get("min_subs") or 1000)
        max_subs = int(req.settings.get("max_subs") or 150000)
        min_ratio = float(req.settings.get("min_ratio") or 1.1)
        video_type = str(req.settings.get("video_type") or "all")

        # Генерируем альтернативные поисковые фразы
        ai_queries = await AIKeywordExpander.expand_topic_with_ai(
            req.query, lang=lang_code, engine=engine, api_keys=req.api_keys
        )
        search_queries = list(dict.fromkeys(ai_queries + [
            f"{req.query} review",
            f"{req.query} tutorial",
            f"{req.query} vs",
            f"{req.query} benchmark",
        ]))

        all_candidates = await YouTubeSearcher.search_viral_videos(
            queries=search_queries,
            days_back=max(days_back, 14),
            min_subs=min_subs,
            max_subs=max_subs,
            min_ratio=min_ratio,
            api_key=req.youtube_key or "",
            language=lang_code,
            video_type=video_type,
        )

        seen = set(req.exclude_video_ids)
        new_outliers: List[Dict[str, Any]] = []

        for vid in all_candidates:
            v_id = vid["video_id"]
            if v_id in seen:
                continue
            seen.add(v_id)

            hours_alive = parse_published_to_hours(vid.get("published_at", ""))
            momentum = MomentumEngine.calculate_momentum(
                views=vid.get("views", 0),
                hours_alive=hours_alive,
                likes=int(vid.get("views", 0) * 0.04),
                comments=int(vid.get("views", 0) * 0.005),
                ratio=vid.get("ratio", 1.0),
            )
            vid["m_score"] = momentum.m_score
            vid["velocity_stage"] = momentum.velocity_stage
            vid["acceleration_pct"] = momentum.acceleration_pct
            vid["is_rocket"] = momentum.is_rocket
            vid["engagement_multiplier"] = momentum.engagement_multiplier

            new_outliers.append(vid)

        new_outliers.sort(
            key=lambda x: (x.get("is_rocket", False), x.get("m_score", 0)),
            reverse=True,
        )
        return new_outliers[:12]

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
        skills_context = await self._skills_context(SkillStage.HOOK_ANALYSIS)
        if skills_context:
            prompt += f"\n\n{skills_context}"

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
        skills_context = await self._skills_context(SkillStage.HOOK_ANALYSIS)
        if skills_context:
            user_prompt += f"\n\nContext:\n{skills_context}"

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
        skills_context = await self._skills_context(SkillStage.SCRIPT_DRAFTING)
        if skills_context:
            system_prompt += f"\n\n---\nSTAGE GUIDELINES ({SkillStage.SCRIPT_DRAFTING.value}):\n{skills_context}"

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
