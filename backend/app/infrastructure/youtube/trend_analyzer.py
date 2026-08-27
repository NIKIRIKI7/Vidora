"""Анализатор живых поисковых подсказок и ранних сигналов (DeepTrend 2.0)."""

import asyncio
import json
import random
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from app.domain.schemas.youtube import EarlySignalItem
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.youtube.normalizer import clean_search_keyword, normalize_language_code
from app.infrastructure.youtube.signal_ingestor import SignalIngestor

CREATIVE_VECTORS_RU = [
    "реальный опыт и тесты",
    "критические ошибки и как избежать",
    "скрытые возможности и лайфхаки",
    "сравнение с главными аналогами",
    "пошаговая настройка с нуля",
    "честный обзор без цензуры",
    "почему все ошибаются",
    "прорывное обновление",
    "секретные фишки профессионалов",
    "скоростной тест и бенчмарк",
]

CREATIVE_VECTORS_EN = [
    "real world benchmark test",
    "critical mistakes to avoid",
    "hidden features and secrets",
    "brutal honest review",
    "step by step setup from scratch",
    "why everyone is wrong about this",
    "breakthrough update",
    "top alternatives compared",
    "speed and performance test",
    "the dark side nobody tells you",
]


class AIKeywordExpander:
    """ИИ-генератор семантики с жёстким временным якорем и защитой от дублирования."""

    @classmethod
    def sanitize_temporal_references(cls, text: str, target_year: int) -> str:
        """Заменяет устаревшие года (2020-2025) на актуальный год."""
        if not text:
            return ""
        return re.sub(r"\b202[0-5]\b", str(target_year), text)

    @classmethod
    async def expand_topic_with_ai(
        cls,
        base_topic: str,
        lang: str = "ru",
        engine: str = "gemma3:4b",
        api_keys: Optional[Dict[str, Any]] = None,
    ) -> List[str]:
        lang_code, region, lang_name = normalize_language_code(lang)
        clean_topic = clean_search_keyword(base_topic)
        cur_year = datetime.now().year

        if not clean_topic:
            return [f"trending tech {cur_year}" if lang_code == "en" else f"тренды технологий {cur_year}"]

        vector_pool = CREATIVE_VECTORS_EN if lang_code == "en" else CREATIVE_VECTORS_RU
        sampled_vectors = random.sample(vector_pool, 2)
        vectors_hint = ", ".join(f"'{v}'" for v in sampled_vectors)

        system_prompt = (
            f"You are an Elite YouTube Search Strategist in {cur_year}.\n"
            f"CRITICAL TEMPORAL RULES:\n"
            f"- The CURRENT YEAR IS {cur_year}. NEVER mention 2023, 2024, or 2025 under any circumstance!\n"
            f"- Any year modifiers MUST be strictly '{cur_year}' or 'latest'.\n"
            f"- Generate 6 distinct, high-CTR YouTube search queries in {lang_name} ({lang_code}).\n"
            f"- Incorporate these fresh angles: {vectors_hint}.\n"
            f"- Return ONLY a JSON object: {{\"queries\": [\"query 1\", \"query 2\", \"query 3\"]}}"
        )
        user_prompt = f"Topic: '{clean_topic}'\nTarget Language: {lang_name} ({region})\nCurrent Year: {cur_year}"

        gateway = LLMGateway(api_keys)
        queries: List[str] = []
        try:
            raw_res = await gateway.generate_text(
                prompt=user_prompt,
                system_prompt=system_prompt,
                engine=engine,
                json_mode=True,
                max_tokens=400,
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

            data = json.loads(clean_json)
            parsed_list = data.get("queries", [])
            if isinstance(parsed_list, list):
                for q in parsed_list:
                    sanitized_q = cls.sanitize_temporal_references(str(q).strip(), cur_year)
                    if sanitized_q:
                        queries.append(sanitized_q)
        except Exception:
            pass

        if not queries:
            queries = [
                f"{clean_topic} {cur_year}",
                f"{clean_topic} {sampled_vectors[0]}",
                f"{clean_topic} {sampled_vectors[1]}",
            ]

        return [cls.sanitize_temporal_references(q, cur_year) for q in queries]


class TrendAnalyzer:
    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    }

    @classmethod
    async def get_early_signals(
        cls,
        query: str,
        lang: str = "ru",
        engine: str = "gemma3:1b",
        api_keys: Optional[Dict[str, Any]] = None,
    ) -> List[EarlySignalItem]:
        lang_code, _, _ = normalize_language_code(lang)
        ai_queries = await AIKeywordExpander.expand_topic_with_ai(query, lang=lang_code, engine=engine, api_keys=api_keys)
        # Случайный выбор ветки для разнообразия социальных сигналов
        primary_query = random.choice(ai_queries) if ai_queries else query
        return await SignalIngestor.collect_early_signals(primary_query, lang=lang_code)

    @classmethod
    async def get_youtube_suggests(cls, query: str, lang: str = "ru", region: str = "RU") -> List[str]:
        lang_code, reg_code, _ = normalize_language_code(lang)
        url = "https://suggestqueries.google.com/complete/search"
        params = {"client": "firefox", "ds": "yt", "q": query, "hl": lang_code, "gl": reg_code}
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(url, params=params, headers=cls.HEADERS)
                if res.status_code == 200:
                    data = res.json()
                    if len(data) > 1 and isinstance(data[1], list):
                        return [str(item) for item in data[1][:12]]
        except Exception:
            pass
        return []

    @classmethod
    async def get_google_suggests(cls, query: str, lang: str = "ru", region: str = "RU") -> List[str]:
        lang_code, reg_code, _ = normalize_language_code(lang)
        url = "https://suggestqueries.google.com/complete/search"
        params = {"client": "firefox", "q": query, "hl": lang_code, "gl": reg_code}
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(url, params=params, headers=cls.HEADERS)
                if res.status_code == 200:
                    data = res.json()
                    if len(data) > 1 and isinstance(data[1], list):
                        return [str(item) for item in data[1][:12]]
        except Exception:
            pass
        return []

    @classmethod
    async def get_yandex_suggests(cls, query: str) -> List[str]:
        url = "https://suggest.yandex.ru/suggest-ya.cgi"
        params = {"part": query, "v": "4"}
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(url, params=params, headers=cls.HEADERS)
                if res.status_code == 200:
                    data = res.json()
                    if len(data) > 1 and isinstance(data[1], list):
                        return [re.sub(r"<.*?>", "", str(item)).strip() for item in data[1][:12]]
        except Exception:
            pass
        return []

    @classmethod
    async def get_expanded_queries(
        cls,
        base_topic: str,
        lang: str = "ru",
        engine: str = "gemma3:1b",
        api_keys: Optional[Dict[str, Any]] = None,
    ) -> List[str]:
        lang_code, region, _ = normalize_language_code(lang)

        # 1. ИИ-генерация ключевых веток (кросс-языковой перевод)
        ai_subtopics = await AIKeywordExpander.expand_topic_with_ai(
            base_topic, lang=lang_code, engine=engine, api_keys=api_keys
        )

        # 2. Автокомплиты поисковиков для ИИ-ключевиков
        tasks = []
        for topic in ai_subtopics[:3]:
            tasks.append(cls.get_youtube_suggests(topic, lang_code, region))
            tasks.append(cls.get_google_suggests(topic, lang_code, region))
            if lang_code == "ru":
                tasks.append(cls.get_yandex_suggests(topic))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        unique_trends = []
        seen = set()

        for q in ai_subtopics:
            if q.lower() not in seen:
                seen.add(q.lower())
                unique_trends.append(q)

        for r in results:
            if isinstance(r, list):
                for item in r:
                    cleaned = item.strip()
                    if cleaned and cleaned.lower() not in seen:
                        seen.add(cleaned.lower())
                        unique_trends.append(cleaned)

        return unique_trends[:25]
