"""Генератор поисковой семантики: двуязычный авто-перевод + LSI-запросы для YouTube.

Если тема введена на русском, а выбран язык English — тема лексически адаптируется
к англоязычному сегменту и наоборот, исключая «языковой конфликт» пустых выдач.
"""

import json
import random
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

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
]
CREATIVE_VECTORS_EN = [
    "real world benchmark test",
    "critical mistakes to avoid",
    "hidden features and secrets",
    "brutal honest review",
    "step by step setup from scratch",
    "why everyone is wrong about this",
    "breakthrough update",
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
        lang: str = "en",
        engine: str = "gemma3:4b",
        api_keys: Optional[Dict[str, Any]] = None,
    ) -> List[str]:
        lang_code, region, lang_name = normalize_language_code(lang)
        clean_topic = clean_search_keyword(base_topic)
        cur_year = datetime.now().year

        if not clean_topic:
            return [f"trending tech {cur_year}" if lang_code == "en" else f"тренды технологий {cur_year}"]

        # Базовый перевод, если язык запроса не совпадает с целевым
        is_cyrillic = bool(re.search(r"[\u0400-\u04FF]", clean_topic))
        translated_topic = clean_topic
        if is_cyrillic and lang_code == "en":
            # Быстрый лексический перевод популярных IT-терминов
            translated_topic = (
                clean_topic.replace("Программирование", "Coding Programming")
                .replace("программирование", "coding")
                .replace("Нейросети", "AI Neural Networks")
                .replace("нейросети", "AI models")
                .replace("ИИ", "AI")
            )
        elif not is_cyrillic and lang_code == "ru":
            translated_topic = clean_topic + " нейросети программирование"

        vector_pool = CREATIVE_VECTORS_EN if lang_code == "en" else CREATIVE_VECTORS_RU
        sampled_vectors = random.sample(vector_pool, 2)
        vectors_hint = ", ".join(f"'{v}'" for v in sampled_vectors)

        system_prompt = (
            f"You are an Elite YouTube Search Strategist in {cur_year}.\n"
            f"CRITICAL RULES:\n"
            f"- Generate 6 distinct, high-CTR YouTube search queries strictly in {lang_name} ({lang_code}).\n"
            f"- If the input topic is in another language, translate and adapt it to {lang_name}.\n"
            f"- Year must be {cur_year} or omitted.\n"
            f"- Incorporate these fresh angles: {vectors_hint}.\n"
            f"- Return ONLY JSON: {{\"queries\": [\"query 1\", \"query 2\", \"query 3\"]}}"
        )
        user_prompt = f"Topic: '{translated_topic}'\nTarget Language: {lang_name}\nCurrent Year: {cur_year}"

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
                data = json.loads(clean_json[start : end + 1])
                for q in data.get("queries", []):
                    sq = cls.sanitize_temporal_references(str(q).strip(), cur_year)
                    if sq and sq not in queries:
                        queries.append(sq)
        except Exception:
            pass

        if not queries:
            queries = [
                f"{translated_topic} {cur_year}",
                f"{translated_topic} {sampled_vectors[0]}",
                f"{translated_topic} {sampled_vectors[1]}",
            ]
        return [cls.sanitize_temporal_references(q, cur_year) for q in queries]


class TrendAnalyzer:
    @classmethod
    async def get_early_signals(
        cls,
        query: str,
        lang: str = "en",
        engine: str = "gemma3:1b",
        api_keys: Optional[Dict[str, Any]] = None,
    ) -> List[EarlySignalItem]:
        lang_code, _, _ = normalize_language_code(lang)
        ai_queries = await AIKeywordExpander.expand_topic_with_ai(
            query, lang=lang_code, engine=engine, api_keys=api_keys
        )
        primary_query = ai_queries[0] if ai_queries else query
        return await SignalIngestor.collect_early_signals(primary_query, lang=lang_code)
