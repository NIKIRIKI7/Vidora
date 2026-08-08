import os
import json
import httpx
import asyncio
from typing import AsyncGenerator, Dict, Any

from app.services.yt_searcher import YouTubeSearcher
from app.services.yt_parser import YouTubeParser
from app.services.yt_exporter import YouTubeExporter
from app.services.trend_analyzer import TrendAnalyzer  # <-- ИМПОРТИРУЕМ НАШ НОВЫЙ СКРИПТ

class YouTubeIdeaAgent:
    def __init__(self, llm_engine: str = "gemma3:1b", api_key: str = "", api_keys: dict = None):
        self.llm_engine = llm_engine
        self.api_key = api_key or os.environ.get("YOUTUBE_API_KEY", "")
        self.api_keys = api_keys or {}

    async def _call_llm(self, system_prompt: str, user_prompt: str, json_format: bool = False) -> str:
        engine = self.llm_engine
        try:
            if "/" in engine:
                from app.services.llm_client import MultiProviderClient
                client = MultiProviderClient(
                    router_key=self.api_keys.get("routerai", ""),
                    aitunnel_key=self.api_keys.get("aitunnel", ""),
                )
                res = await client.chat(
                    model=engine,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    response_format={"type": "json_object"} if json_format else None,
                    max_tokens=2500
                )
                return res or ""
            else:
                from app.services.llama_local import resolve_gguf, local_generate
                if resolve_gguf(engine):
                    prompt_suffix = "\nОТВЕТЬ СТРОГО В ФОРМАТЕ JSON." if json_format else ""
                    res = await local_generate(engine, system_prompt, user_prompt + prompt_suffix)
                    return res or ""
                else:
                    payload = {"model": engine, "prompt": f"{system_prompt}\n\n{user_prompt}", "stream": False}
                    if json_format: payload["format"] = "json"
                    async with httpx.AsyncClient(timeout=180.0) as client:
                        res = await client.post("http://127.0.0.1:11434/api/generate", json=payload)
                        if res.status_code == 200:
                            return res.json().get("response", "")
                        return f'{{"error": "Ошибка Ollama: {res.status_code}"}}'
        except Exception as e:
            return f'{{"error": "{str(e)}"}}'

    async def run_pipeline(self, user_query: str, settings: Dict[str, Any], project_path: str) -> AsyncGenerator[str, None]:
        def yield_log(msg: str, status: str = "info"):
            print(f"[YT_AGENT] {msg}")
            return json.dumps({"type": "log", "message": msg, "status": status}) + "\n"
        
        lang_code = settings.get("language", "ru")
        lang_map = {"ru": "Russian", "en": "English", "es": "Spanish"}
        target_lang = lang_map.get(lang_code, "Russian")

        yield yield_log(f"🤖 Запуск агента. Язык: {target_lang}")

        if not self.api_key:
            yield yield_log("❌ YOUTUBE_API_KEY не задан.", "error")
            yield json.dumps({"type": "done", "analysis": ""}) + "\n"
            return

        base_queries = [q.strip() for q in user_query.split(",") if q.strip()]
        queries = base_queries.copy()

        # === 1. АНАЛИЗ ТРЕНДОВ ===
        if settings.get("search_mode") == "trending":
            yield yield_log(f"📊 Собираю статистику интереса (YouTube, Google, Yandex) по запросу '{user_query}'...")
            
            # Собираем тренды для первого ключа (самого важного)
            trends_data = await TrendAnalyzer.get_combined_trends(base_queries[0], lang_code)
            
            yt_trends_str = ", ".join(trends_data["youtube"]) if trends_data["youtube"] else "Нет данных"
            gg_trends_str = ", ".join(trends_data["google"]) if trends_data["google"] else "Нет данных"
            ya_trends_str = ", ".join(trends_data["yandex"]) if trends_data["yandex"] else "Нет данных"
            
            yield yield_log(f"🧠 ИИ анализирует горячие тренды и генерирует ключи...")

            prompt = f"""You are a strict YouTube SEO strategist. The user's target niche is: '{user_query}'. 
            
Here are the REAL current trending search terms typed by real users today:
- YouTube Trends: {yt_trends_str}
- Google Trends: {gg_trends_str}
- Yandex Trends: {ya_trends_str}

Based ON THESE TRENDS, generate 5 highly specific, long-tail YouTube search queries (3-5 words each) strictly within the tech/professional niche.
Prevent off-topic results. Focus on high-intent queries that people are actually searching right now.
CRITICAL: The queries MUST be written in {target_lang}.
Return ONLY a valid JSON object: {{"queries": ["specific query 1", "specific query 2", "specific query 3", "specific query 4", "specific query 5"]}}"""
            
            llm_res = await self._call_llm(prompt, "", json_format=True)
            try:
                clean_res = llm_res.strip()
                if clean_res.startswith("```json"): clean_res = clean_res[7:-3]
                elif clean_res.startswith("```"): clean_res = clean_res[3:-3]
                
                data = json.loads(clean_res.strip())
                if "queries" in data and isinstance(data["queries"], list):
                    generated_queries = data["queries"]
                    queries.extend(generated_queries)
                    yield yield_log(f"📈 Сгенерированы трендовые запросы: {', '.join(generated_queries)}")
            except Exception:
                yield yield_log(f"⚠️ Ошибка парсинга ключей от ИИ. Используем только базовые.", "warning")

        # === 2. ПОИСК ВИДЕО ===
        yield yield_log(f"🕵️ Ищу строго релевантные видео (до 50 результатов на запрос)...")
        videos = await YouTubeSearcher.search_viral_videos(
            queries=queries,
            days_back=settings.get("days_back", 7),
            min_subs=settings.get("min_subs", 1000),
            max_subs=settings.get("max_subs", 50000),
            min_ratio=settings.get("min_ratio", 1.5),
            api_key=self.api_key,
            language=lang_code,
            video_type=settings.get("video_type", "all")
        )

        if not videos:
            yield yield_log("❌ Релевантных вирусных видео не найдено. Смягчите фильтры.", "error")
            yield json.dumps({"type": "done", "analysis": ""}) + "\n"
            return

        yield yield_log(f"🔥 Найдено {len(videos)} крутых роликов!", "success")
        yield json.dumps({"type": "videos_ready", "results": videos}) + "\n"

        # === 3. МЕТАДАННЫЕ И ЭКСПОРТ ===
        yield yield_log("📥 Скачиваем транскрипции топ-3 роликов для ИИ-анализа...")
        for idx, vid in enumerate(videos[:3]):
            meta = await asyncio.to_thread(
                YouTubeParser.download_metadata_and_subs,
                vid["video_id"], vid["url"], os.path.join(project_path, "assets", "refs"), lang_code
            )
            vid["transcript_sample"] = meta.get("transcript_sample", "")

        yield yield_log("📊 Формирую Excel-отчет...")
        excel_path = await asyncio.to_thread(YouTubeExporter.to_excel, videos, project_path)
        yield json.dumps({"type": "excel_ready", "excel_path": excel_path}) + "\n"

        # === 4. АНАЛИЗ И ГЕНЕРАЦИЯ ИДЕЙ ===
        ideas_count = settings.get("ideas_count", 10)
        yield yield_log(f"🧠 ИИ ({self.llm_engine}) пишет выводы и {ideas_count} идей для ролика...")
        
        analysis_prompt = f"""You are a professional YouTube producer. Analyze the following viral videos and their stats.
YOUR TASKS:
1. Provide 3 clear conclusions on WHY these videos went viral.
2. Suggest EXACTLY {ideas_count} highly engaging video ideas for our next video based on this data.
CRITICAL RULES:
- Number your ideas from 1 to {ideas_count}.
- The ENTIRE response MUST be strictly in {target_lang}. Do NOT use other languages!
"""
        videos_context = "\n".join([f"- {v['title']} (Views: {v['views']}, {v['ratio']}x channel base)" for v in videos[:3]])
        final_analysis = await self._call_llm(analysis_prompt, f"VIDEOS:\n{videos_context}")

        yield yield_log("✅ Итог анализа готов!", "success")
        yield json.dumps({"type": "done", "analysis": final_analysis}) + "\n"