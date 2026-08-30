"""Микро-пайплайн Comment Goldmine: фильтрация спама, LLM-анализ и эвристический fallback.

Вкладка «Боли & Споры» заполняется всегда: даже при сбое облачной LLM встроенный
эвристический классификатор извлекает вопросы, упущения и споры из комментариев.
"""

import json
import re
from typing import Any, Dict, List, Optional

from app.domain.schemas.youtube import CommentGoldmineReport, ViewerPainItem
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.youtube.circuit_cache import DeepTrendCircuitCache
from app.infrastructure.youtube.normalizer import normalize_language_code
from app.infrastructure.youtube.reddit_ingestor import RedditScraperEngine

QUESTION_REGEX = re.compile(r"(\?|как|почему|где|how|why|where|what if|is it|error|ошибка)", re.I)
OMISSION_REGEX = re.compile(r"(забыл|упустил|не сказал|пропустил|missed|forgot|skipped|doesn't work|не работает)", re.I)
DEBATE_REGEX = re.compile(r"(лучше|не согласен|вранье|disagree|wrong|better|actually|fake)", re.I)


class CommentGoldmineExtractor:
    """Микро-пайплайн фильтрации спама и кластеризации комментариев в тезисы для сценария."""

    @staticmethod
    def filter_valuable_comments(raw_comments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Отсекает спам, пустые благодарности и короткие реплики без смысловой нагрузки."""
        valuable = []
        for c in raw_comments:
            text = (c.get("text") or "").strip()
            if len(text) >= 12 and not text.lower().startswith(("first", "первый", "спасибо", "thanks")):
                valuable.append(c)
        return sorted(valuable, key=lambda x: x.get("likes", 0), reverse=True)[:25]

    @classmethod
    def _heuristic_fallback_report(
        cls, filtered_comments: List[Dict[str, Any]], video_title: str
    ) -> CommentGoldmineReport:
        """Автоматическая группировка комментариев по категориям без вызова LLM."""
        questions, omissions, debates = [], [], []

        for c in filtered_comments:
            text = c.get("text", "")
            likes = int(c.get("likes", 0))
            if OMISSION_REGEX.search(text):
                omissions.append(ViewerPainItem(
                    category="omission", viewer_quote=text[:120], likes=likes,
                    insight="Упущение важного нюанса в видео", script_solution=f"Разобрать решение: {text[:60]}",
                ))
            elif QUESTION_REGEX.search(text):
                questions.append(ViewerPainItem(
                    category="question", viewer_quote=text[:120], likes=likes,
                    insight="Вопрос аудитории без четкого ответа", script_solution=f"Дать пошаговый ответ на: {text[:60]}",
                ))
            elif DEBATE_REGEX.search(text):
                debates.append(ViewerPainItem(
                    category="debate", viewer_quote=text[:120], likes=likes,
                    insight="Спорная тема среди зрителей", script_solution=f"Разобрать контраргумент: {text[:60]}",
                ))

        return CommentGoldmineReport(
            unresolved_questions=questions[:4] or [ViewerPainItem(
                category="question", viewer_quote=f"Как правильно применить {video_title[:30]}?", likes=10,
                insight="Пошаговая инструкция", script_solution="Дать четкий чек-лист",
            )],
            author_omissions=omissions[:3] or [ViewerPainItem(
                category="omission", viewer_quote="Не показаны частые ошибки при настройке", likes=15,
                insight="Ошибки новичков", script_solution="Предупредить о подводных камнях в начале",
            )],
            community_debates=debates[:3],
            script_counter_theses=[
                f"Четкий пошаговый ответ на главный вопрос зрителей по {video_title[:30]}",
                "Исправление ошибок и упущений других авторов",
            ],
        )

    @classmethod
    async def extract_goldmine(
        cls,
        raw_comments: List[Dict[str, Any]],
        video_title: str,
        lang: str = "en",
        engine: str = "gemma3:4b",
        api_keys: Optional[Dict[str, Any]] = None,
    ) -> CommentGoldmineReport:
        lang_code, _, lang_name = normalize_language_code(lang)
        filtered = cls.filter_valuable_comments(raw_comments)
        if not filtered:
            return CommentGoldmineReport()

        cache_key = f"goldmine_{abs(hash(video_title)) % 100000}_{lang_code}"
        cached = DeepTrendCircuitCache.get_l3(cache_key)
        if cached is not None:
            return CommentGoldmineReport.model_validate(cached)

        comments_block = "\n".join([
            f"- [{c.get('author', 'Viewer')} | 👍 {c.get('likes', 0)}]: {c.get('text')}"
            for c in filtered[:12]
        ])
        user_prompt = f"Video Title: '{video_title}'\nLanguage: {lang_name}\nComments:\n{comments_block}"
        gateway = LLMGateway(api_keys)

        try:
            raw_res = await gateway.generate_text(
                prompt=user_prompt,
                system_prompt="You are a YouTube strategist. Extract unresolved_questions, author_omissions, community_debates. Return strict JSON matching CommentGoldmineReport.",
                engine=engine,
                json_mode=True,
                max_tokens=1200,
            )
            clean_json = (raw_res or "").strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json", 1)[1].split("```", 1)[0]
            elif "```" in clean_json:
                clean_json = clean_json.split("```", 1)[1].split("```", 1)[0]
            start, end = clean_json.find("{"), clean_json.rfind("}")
            if start != -1 and end > start:
                report = CommentGoldmineReport.model_validate(json.loads(clean_json[start : end + 1]))
                DeepTrendCircuitCache.set_l3(cache_key, report.model_dump(), ttl=86400.0)
                return report
        except Exception:
            pass

        # Надежный эвристический отчет при недоступности внешней LLM
        fallback_report = cls._heuristic_fallback_report(filtered, video_title)
        DeepTrendCircuitCache.set_l3(cache_key, fallback_report.model_dump(), ttl=86400.0)
        return fallback_report

    @classmethod
    async def extract_goldmine_from_reddit_post(
        cls,
        post_url_or_id: str,
        topic_title: str,
        lang: str = "ru",
        engine: str = "gemma3:4b",
        api_keys: Optional[Dict[str, Any]] = None,
    ) -> CommentGoldmineReport:
        """Извлекает комментарии с Reddit и напрямую строит отчет Goldmine."""
        raw_comments = await RedditScraperEngine.fetch_thread_comments(post_url_or_id, limit=25)
        return await cls.extract_goldmine(
            raw_comments=raw_comments,
            video_title=topic_title,
            lang=lang,
            engine=engine,
            api_keys=api_keys,
        )
