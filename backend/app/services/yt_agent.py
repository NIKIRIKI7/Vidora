import os
import json
import httpx
import asyncio
from typing import AsyncGenerator, Dict, Any

from app.services.yt_searcher import YouTubeSearcher
from app.services.yt_parser import YouTubeParser
from app.services.yt_exporter import YouTubeExporter
from app.services.trend_analyzer import TrendAnalyzer

class YouTubeIdeaAgent:
    def __init__(self, llm_engine: str = "gemma3:1b", api_key: str = "", api_keys: dict = None):
        self.llm_engine = llm_engine
        self.api_key = api_key or os.environ.get("YOUTUBE_API_KEY", "")
        self.api_keys = api_keys or {}

    async def _call_llm(self, system_prompt: str, user_prompt: str, json_format: bool = False, max_tokens: int = 3000) -> str:
        engine = self.llm_engine
        try:
            if "/" in engine:
                from app.services.llm_client import MultiProviderClient
                client = MultiProviderClient(router_key=self.api_keys.get("routerai", ""), aitunnel_key=self.api_keys.get("aitunnel", ""))
                res = await client.chat(
                    model=engine,
                    messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
                    response_format={"type": "json_object"} if json_format else None,
                    max_tokens=max_tokens
                )
                return res or ""
            else:
                from app.services.llama_local import resolve_gguf, local_generate
                if resolve_gguf(engine):
                    prompt_suffix = "\nОТВЕТЬ СТРОГО В ФОРМАТЕ JSON." if json_format else ""
                    return await local_generate(engine, system_prompt, user_prompt + prompt_suffix) or ""
                else:
                    payload = {"model": engine, "prompt": f"{system_prompt}\n\n{user_prompt}", "stream": False}
                    if json_format: payload["format"] = "json"
                    async with httpx.AsyncClient(timeout=180.0) as client:
                        res = await client.post("http://127.0.0.1:11434/api/generate", json=payload)
                        if res.status_code == 200: return res.json().get("response", "")
                        return f'{{"error": "Ошибка Ollama: {res.status_code}"}}'
        except Exception as e:
            return f'{{"error": "{str(e)}"}}'

    def _extract_json(self, raw: str) -> dict:
        clean = raw.strip()
        if clean.startswith("```json"): clean = clean[7:-3]
        elif clean.startswith("```"): clean = clean[3:-3]
        try:
            return json.loads(clean.strip())
        except Exception:
            start, end = clean.find('{'), clean.rfind('}')
            if start != -1 and end > start:
                try:
                    return json.loads(clean[start:end + 1])
                except Exception:
                    pass
        return {}

    async def suggest_competitors(self, niche: str) -> dict:
        prompt = f"Ты эксперт по YouTube. Назови 10 самых популярных и активных YouTube-каналов в нише: '{niche}'. Верни ТОЛЬКО валидный JSON в формате: {{\"channels\": [\"ChannelName1\", \"ChannelName2\"]}}. Без лишнего текста."
        res = await self._call_llm(prompt, "", json_format=True, max_tokens=300)
        return self._extract_json(res)

    async def analyze_channel(self, channel_url_or_name: str) -> str:
        if not self.api_key:
            return "Ошибка: YOUTUBE_API_KEY не задан."
        base_url = "https://www.googleapis.com/youtube/v3"

        query = channel_url_or_name.strip()
        if "youtube.com" in query or "youtu.be" in query:
            parts = [p for p in query.split("/") if p]
            if parts:
                query = parts[-1].split("?")[0]

        async with httpx.AsyncClient(timeout=30.0) as client:
            search_res = await client.get(f"{base_url}/search", params={
                "part": "snippet", "q": query, "type": "channel", "maxResults": 1, "key": self.api_key
            })
            search_data = search_res.json()
            if not search_data.get("items"):
                return "Не удалось найти канал."

            channel_id = search_data["items"][0]["id"]["channelId"]
            channel_res = await client.get(f"{base_url}/channels", params={
                "part": "snippet,contentDetails", "id": channel_id, "key": self.api_key
            })
            channel_data = channel_res.json()
            if not channel_data.get("items"):
                return "Не удалось получить информацию о канале."

            channel_info = channel_data["items"][0]
            description = channel_info["snippet"].get("description", "")

            try:
                uploads_id = channel_info["contentDetails"]["relatedPlaylists"]["uploads"]
                playlist_res = await client.get(f"{base_url}/playlistItems", params={
                    "part": "snippet", "playlistId": uploads_id, "maxResults": 15, "key": self.api_key
                })
                playlist_data = playlist_res.json()
                recent_videos = [item["snippet"]["title"] for item in playlist_data.get("items", [])]
            except Exception:
                recent_videos = []

        videos_text = "\n".join([f"- {t}" for t in recent_videos])
        prompt = f"Проанализируй описание YouTube-канала и названия его последних видео.\nНапиши кратко (2-3 предложения) от первого лица, о чем этот канал, в каком стиле и для кого он снимает видео.\n\nОписание канала:\n{description}\n\nПоследние видео:\n{videos_text}"
        system_prompt = "Ты эксперт по YouTube. Отвечай кратко, емко и только от первого лица (Я снимаю...)."

        res = await self._call_llm(system_prompt, prompt, max_tokens=300)
        return res.strip()

    async def run_pipeline(self, user_query: str, settings: Dict[str, Any], project_path: str) -> AsyncGenerator[str, None]:
        def yield_log(msg: str, status: str = "info"):
            print(f"[YT_AGENT] {msg}")
            return json.dumps({"type": "log", "message": msg, "status": status}) + "\n"
        
        lang_code = settings.get("language", "ru")
        lang_map = {"ru": "Russian", "en": "English", "es": "Spanish"}
        target_lang = lang_map.get(lang_code, "Russian")
        channel_context = settings.get("channel_context", "")

        yield yield_log(f"🤖 Запуск пайплайна 2.0. Язык: {target_lang}")

        search_mode = settings.get("search_mode", "trending")

        if search_mode == "competitors":
            channels = settings.get("channels", [])
            if not channels:
                yield yield_log("❌ Список каналов пуст.", "error")
                return
            yield yield_log(f"🕵️ Ищу аномалии (Outliers) на {len(channels)} каналах конкурентов...")
            raw_videos = await YouTubeSearcher.search_channel_outliers(
                channels=channels, days_back=settings.get("days_back", 90),
                min_ratio=settings.get("min_ratio", 2.0), api_key=self.api_key,
                video_type=settings.get("video_type", "all")
            )
        else:
            base_queries = [q.strip() for q in user_query.split(",") if q.strip()]
            queries = base_queries.copy()

            if search_mode == "trending":
                yield yield_log(f"📊 Анализ мультиплатформенных трендов (YT, Google, Yandex)...")
                trends_data = await TrendAnalyzer.get_combined_trends(base_queries[0], lang_code)
                yt_trends = ", ".join(trends_data["youtube"]) if trends_data["youtube"] else "Нет данных"
                gg_trends = ", ".join(trends_data["google"]) if trends_data["google"] else "Нет данных"

                prompt = f"""Ты AI-Аналитик YouTube. Тематика: '{base_queries[0]}'. Целевой язык: {target_lang}.
Тренды:
YouTube: {yt_trends}
Google: {gg_trends}

Сгенерируй 5-7 узких, вирусных поисковых запросов для YouTube СТРОГО НА ЯЗЫКЕ '{target_lang}'. Не используй другие языки в ответах. Верни JSON: {{"queries": ["q1", "q2", "q3", "q4", "q5"]}}"""

                llm_res = await self._call_llm(prompt, "", json_format=True, max_tokens=500)
                data = self._extract_json(llm_res)
                if isinstance(data.get("queries"), list) and len(data["queries"]) > 0:
                    queries = data["queries"]
                    yield yield_log(f"📈 Сгенерированы трендовые запросы ({target_lang}): {', '.join(data['queries'])}")
                else:
                    yield yield_log(f"⚠️ ИИ не вернул запросы на {target_lang}, иду по базовым: {', '.join(base_queries)}", "warning")

            yield yield_log(f"🕵️ Ищу аномалии по просмотрам (VPH)...")
            raw_videos = await YouTubeSearcher.search_viral_videos(
                queries=queries, days_back=settings.get("days_back", 7),
                min_subs=settings.get("min_subs", 1000), max_subs=settings.get("max_subs", 50000),
                min_ratio=settings.get("min_ratio", 1.5), api_key=self.api_key,
                language=lang_code, video_type=settings.get("video_type", "all")
            )

        if not raw_videos:
            yield yield_log("❌ Вирусных видео не найдено.", "error")
            yield json.dumps({"type": "done", "analysis": {}}) + "\n"
            return

        # СЕМАНТИЧЕСКАЯ ФИЛЬТРАЦИЯ ЧЕРЕЗ LLM
        yield yield_log("🧹 ИИ очищает выдачу от кликбейта и нерелевантного мусора...")
        titles_dict = {v['video_id']: v['title'] for v in raw_videos[:40]}
        filter_prompt = f"""Filter this list of YouTube video titles. Keep ONLY videos that are genuinely related to the professional/tech niche: '{user_query}'.
Discard gaming Let's Plays, political news, mindless entertainment, or completely off-topic videos.
Return ONLY a JSON object with a list of the video IDs you want to KEEP.
Format: {{"keep_ids": ["id1", "id2"]}}"""
        
        filter_res = await self._call_llm(filter_prompt, json.dumps(titles_dict, ensure_ascii=False), json_format=True, max_tokens=1500)
        filter_data = self._extract_json(filter_res)
        
        final_videos = raw_videos
        if "keep_ids" in filter_data:
            keep_ids = set(filter_data["keep_ids"])
            final_videos = [v for v in raw_videos if v['video_id'] in keep_ids]
            yield yield_log(f"✂️ ИИ отсеял {len(raw_videos) - len(final_videos)} нерелевантных видео.")

        if not final_videos:
            final_videos = raw_videos[:10] # Fallback
        
        yield yield_log(f"🔥 Найдено {len(final_videos)} чистых аномалий!", "success")
        yield json.dumps({"type": "videos_ready", "results": final_videos}) + "\n"

        yield yield_log("📥 Скачиваем транскрипции топ-3 роликов для глубокого анализа...")
        for idx, vid in enumerate(final_videos[:3]):
            meta = await asyncio.to_thread(YouTubeParser.download_metadata_and_subs, vid["video_id"], vid["url"], os.path.join(project_path, "assets", "refs"), lang_code)
            vid["transcript_sample"] = meta.get("transcript_sample", "")

        yield yield_log("📊 Формирую Excel-отчет...")
        excel_path = await asyncio.to_thread(YouTubeExporter.to_excel, final_videos, project_path)
        yield json.dumps({"type": "excel_ready", "excel_path": excel_path}) + "\n"

        ideas_count = settings.get("ideas_count", 10)
        yield yield_log(f"🧠 Генерирую готовую 'Упаковку' (Идеи + 3 заголовка + ТЗ)...")
        
        ctx_instruction = f"The user's channel context is: '{channel_context}'. ADAPT ALL IDEAS heavily to fit this context!" if channel_context else ""

        analysis_prompt = f"""You are an elite YouTube Producer. Analyze these viral videos (outliers) and their transcripts.
YOUR TASKS:
1. "conclusions": Provide 3 clear conclusions on WHY these formats/topics went viral (e.g., pacing, hook strategy, bridging a knowledge gap).
2. "ideas": Generate EXACTLY {ideas_count} highly engaging video ideas based on this data. {ctx_instruction}
For EACH idea, provide:
- "titles": Array of 3 highly clickable, curiosity-driven titles (NOT clickbait, but irresistible).
- "description": A short pitch of what the video is about.
- "thumbnail_concept": A clear visual instruction for the thumbnail design.

CRITICAL RULES:
- The ENTIRE response MUST be strictly in {target_lang}.
- Return ONLY a valid JSON object matching this schema:
{{
  "conclusions": ["...", "...", "..."],
  "ideas": [
    {{ "titles": ["...", "...", "..."], "description": "...", "thumbnail_concept": "..." }}
  ]
}}"""
        videos_context = "\n".join([f"- Title: {v['title']}\n  Stats: {v['views']} views, {v['vph']} VPH, {v['ratio']}x channel base\n  Transcript: {(v.get('transcript_sample') or '')[:500]}..." for v in final_videos[:3]])
        
        final_analysis = await self._call_llm(analysis_prompt, videos_context, json_format=True, max_tokens=4000)
        analysis_data = self._extract_json(final_analysis)

        yield yield_log("✅ Итог анализа готов!", "success")
        yield json.dumps({"type": "done", "analysis": analysis_data}) + "\n"

    async def analyze_hook(self, transcript: str) -> dict:
        """Анализирует первые 30 сек видео и крадет хук"""
        words = transcript.split()[:150]
        sample = " ".join(words)
        prompt = """Analyze the hook (first 30 seconds) of this viral YouTube video.
Return a JSON object with:
1. "original_hook": The actual hook extracted.
2. "psychology": Briefly explain WHY it works (open loop, fear, promise, etc).
3. "stolen_hooks": An array of 3 new, original hooks using the EXACT same psychological formula, but adapted for a general tech/software topic.
Language: Russian."""
        res = await self._call_llm(prompt, f"TRANSCRIPT:\n{sample}", json_format=True, max_tokens=1000)
        return self._extract_json(res)

    async def draft_script(self, title: str, description: str, context: str, lang: str = "ru", video_type: str = "long", target_duration: str = "3", custom_prompt: str = "") -> str:
        """Создает черновой Markdown сценарий Vidora в 1 клик"""
        lang_map = {"ru": "Russian", "en": "English", "es": "Spanish"}
        target = lang_map.get(lang, "Russian")
        skill = None
        skill_path = os.path.join(os.path.dirname(__file__), "prompts", "tech_scriptwriter.md")
        if os.path.exists(skill_path):
            with open(skill_path, "r", encoding="utf-8") as f:
                skill = f.read()

        if custom_prompt:
            prompt = custom_prompt
        else:
            target_dur_float = 3.0
            try:
                if target_duration:
                    target_dur_float = float(target_duration)
            except Exception:
                pass
            format_instruction = "Формат: вертикальный Shorts/Reels (сверхбыстрый темп, удержание внимания, до 60 секунд)" if video_type == "short" else "Формат: классическое горизонтальное видео"
            duration_instruction = f"- Ориентировочный хронометраж: {target_duration} минут (напиши текст для диктора объемом строго около {int(target_dur_float * 150)} слов). Рассчитывай объем текста исходя из того, что диктор читает ~150 слов в минуту." if target_duration else ""
            prompt = f"""You are a professional YouTube scriptwriter for a faceless tech channel.
Write a script draft for the video titled: "{title}".
Idea context: {description}.
Channel context: {context}.

Requirements:
- {format_instruction}
{duration_instruction}

RULES:
- Output MUST be valid Vidora Markdown.
- Use blocks: [Хук] (00:00:00), [Вступление] (00:00:15), [Основная часть 1] (00:00:45), etc.
- Each block must have visual remarks in parenthesis like *(Экран: ...)* or *(B-roll: ...)*.
- Write the voiceover text plainly after the remarks.
- Keep the script punchy, engaging, and fast-paced.
- Follow the attached scriptwriter skill for hook/pacing/retention techniques.
- Language: {target}.
Return ONLY the markdown text (do not wrap in ```markdown)."""
        system = skill if skill else f"You are a professional YouTube scriptwriter for a faceless tech channel. Language: {target}."
        res = await self._call_llm(system, prompt, max_tokens=3000)
        return res.strip()