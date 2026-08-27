"""Микро-пайплайн Comment Goldmine: фильтрация спама и кластеризация болей аудитории.

Превращает комментарии вирусных видео в структурированные тезисы для сценария:
вопросы зрителей, упущения автора и холивары сообщества.
"""

import json
import re
from typing import Any, Dict, List, Optional

from app.domain.schemas.youtube import CommentGoldmineReport
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.youtube.circuit_cache import DeepTrendCircuitCache
from app.infrastructure.youtube.normalizer import normalize_language_code


COMMENT_GOLDMINE_SYSTEM_PROMPT = """
You are an Elite YouTube Audience Analyst and Video Script Director.
Analyze audience comments from competitor viral videos and extract the "Comment Goldmine" of viewer friction, confusion, and debates.

CATEGORIZE COMMENTS INTO 3 STRICT GROUPS:
1. UNRESOLVED QUESTIONS: What specific setup issues, edge cases, or features do viewers still not understand?
2. AUTHOR OMISSIONS: What critical technical settings, pricing traps, bugs, or OS limitations did the author fail to mention?
3. COMMUNITY DEBATES: What heated arguments or controversial comparisons are occurring in the comments?

GENERATE SCRIPT COUNTER-THESES:
Formulate 3 actionable, high-conviction script counter-theses that our video MUST address to outperform competitor videos.

RETURN STRICT JSON ONLY (no markdown):
{
  "unresolved_questions": [
    {"category": "question", "viewer_quote": "Exact or synthesized viewer comment", "likes": 45, "insight": "The root confusion or friction", "script_solution": "Direct answer/demonstration to integrate into script"}
  ],
  "author_omissions": [
    {"category": "omission", "viewer_quote": "Comment pointing out an omission", "likes": 89, "insight": "What the original creator missed", "script_solution": "The missing step to demonstrate in our video"}
  ],
  "community_debates": [
    {"category": "debate", "viewer_quote": "Comment challenging the author or comparing tools", "likes": 32, "insight": "The core controversy", "script_solution": "The balanced resolution and proof"}
  ],
  "script_counter_theses": [
    "Thesis 1 answering the core question",
    "Thesis 2 fixing the main author omission",
    "Thesis 3 settling the debate with evidence"
  ]
}
"""


class CommentGoldmineExtractor:
    """Микро-пайплайн фильтрации спама и кластеризации комментариев в тезисы для сценария."""

    @staticmethod
    def filter_valuable_comments(raw_comments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Отсекает спам, пустые благодарности и короткие реплики без смысловой нагрузки."""
        junk_patterns = [
            r"^(first|второй|первый|top|nice|cool|great video|спасибо|круто|лайк|👍|🔥)+$",
            r"^thanks?\s+for\s+the?\s+(video|sharing|watching)",
            r"^спасибо\s+за\s+(видео|ролик|обзор)",
            r"^\d{1,2}:\d{2}$",
            r"^subscribe to my channel",
            r"https?:\/\/",
        ]
        valuable = []
        for c in raw_comments:
            text = (c.get("text") or "").strip()
            if len(text) < 18:
                continue
            if any(re.search(pat, text, re.IGNORECASE) for pat in junk_patterns):
                continue
            valuable.append(c)

        return sorted(valuable, key=lambda x: x.get("likes", 0), reverse=True)[:20]

    @classmethod
    async def extract_goldmine(
        cls,
        raw_comments: List[Dict[str, Any]],
        video_title: str,
        lang: str = "ru",
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
            for c in filtered[:15]
        ])

        user_prompt = (
            f"Target Video Title: '{video_title}'\n"
            f"Target Language: {lang_name} ({lang_code})\n\n"
            f"Audience Comments from viral video:\n{comments_block}"
        )

        gateway = LLMGateway(api_keys)
        try:
            raw_res = await gateway.generate_text(
                prompt=user_prompt,
                system_prompt=COMMENT_GOLDMINE_SYSTEM_PROMPT,
                engine=engine,
                json_mode=True,
                max_tokens=1500,
            )
            clean_json = (raw_res or "").strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json", 1)[1].split("```", 1)[0]
            elif "```" in clean_json:
                clean_json = clean_json.split("```", 1)[1].split("```", 1)[0]
            start = clean_json.find("{")
            end = clean_json.rfind("}")
            if start != -1 and end > start:
                clean_json = clean_json[start : end + 1]

            report = CommentGoldmineReport.model_validate(json.loads(clean_json))
            DeepTrendCircuitCache.set_l3(cache_key, report.model_dump(), ttl=86400.0)
            return report
        except Exception as e:
            print(f"[Comment Goldmine Error] {e}")
            return CommentGoldmineReport(
                script_counter_theses=[
                    f"Подробный ответ на главный вопрос зрителей о {video_title}",
                    "Разбор технического нюанса, пропущенного в оригинальном видео",
                ]
            )
