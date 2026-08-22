import os
import json
import httpx
import asyncio
from typing import AsyncGenerator, Dict, Any

from app.services.yt_searcher import YouTubeSearcher
from app.services.yt_parser import YouTubeParser
from app.services.yt_exporter import YouTubeExporter
from app.services.trend_analyzer import TrendAnalyzer

MINIMAX_VOICE_RULES = """## 3. Правило суфлера и аудио-режиссура (MiniMax Speech 2.8 HD)
Диктор — нейросеть MiniMax speech-2.8-hd. В ролике голос — единственный носитель харизмы, поэтому теги ниже ОБЯЗАТЕЛЬНЫ к использованию. Теги — команды для диктора: они не произносятся вслух и не считаются словами при расчёте таймкодов.
⚠️ **КРИТИЧЕСКОЕ ПРАВИЛО:** НИКОГДА не оборачивай теги в обратные кавычки (`), жирный шрифт (**) или курсив (*). Пиши их как обычный текст.

### 3.1 Тег эмоции фрагмента
Если фрагменту нужен тон, поставь `[emotion: X]` в самом начале текста.
X — СТРОГО одно из этих слов: `happy`, `sad`, `angry`, `fearful`, `disgusted` (НЕ disgust!), `surprised`, `calm`.
- Только один тег в начале реплики.
- Теги `whisper` и `fluent` ЗАПРЕЩЕНЫ.

### 3.2 Теги междометий и звуков (внутри фразы)
Пишутся в круглых скобках как обычный текст: (breath), (inhale), (exhale), (sighs), (chuckle), (laughs), (clear-throat), (emm), (coughs), (groans), (gasps), (sniffs).

### 3.3 Теги драматических пауз
`<#X#>`, где X — секунды тишины, от 0.1 до 3.0. Обязательно отделяй пробелами: `слово <#1.0#> слово`.

### 3.4 Пример эталонного фрагмента:
[emotion: disgusted] Я запускаю этот скрипт на проде, и... <#1.0#> (sighs) база данных просто исчезает. <#0.8#> (chuckle) Благо, у нас был бэкап. (breath) Иначе это был бы конец.

### 3.5 Фонетическая транслитерация
ВСЕ английские слова, названия брендов и IT-термины должны быть написаны русскими буквами (эпл, пайтон, эн джинкс)."""

LOCAL_VOICE_RULES = """## 3. Правило суфлера и аудио-режиссура (OmniVoice / Qwen / Moss / Локальный TTS)
Диктор — локальная нейросеть (OmniVoice, Qwen-TTS, Moss-TTS, Silero или Fish Audio). Эти модели НЕ поддерживают теги MiniMax (`[emotion]`, `<#1.0#>`, `(sighs)`) — читают текст буквально.

### 3.1 Выразительность без тегов
- ЗАПРЕЩЕНО использовать теги `[emotion: X]`, `<#X#>`, `(breath)`, `(sighs)`.
- Для логического выделения (усиления) главного слова пиши его КАПСОМ — LLM-TTS реагируют на регистр.
- Драматическую паузу делай многоточием (`...`) или тире.
- Эмоции передавай риторическими вопросами, короткими фразами и восклицаниями.

### 3.2 Пример эталонного фрагмента:
`Я запускаю этот скрипт на проде... и база данных ПРОСТО ИСЧЕЗАЕТ. Ну, кто бы сомневался. Благо, у нас был бэкап. Иначе это был бы конец.`

### 3.3 Фонетическая транслитерация
ВСЕ английские слова, бренды и IT-термины пиши русскими буквами (эпл, пайтон, эн джинкс, си плюс плюс)."""

MCP_SYSTEM_PROMPT = """Ты — автономный YouTube Research & Creation Agent 2.0 для платформы Vidora."""

async def check_tsx_syntax(code: str) -> str:
    import tempfile
    import subprocess
    from pathlib import Path
    remotion_dir = Path(__file__).resolve().parents[2] / "remotion-project"
    with tempfile.NamedTemporaryFile(suffix=".tsx", delete=False, mode="w", encoding="utf-8") as f:
        f.write(code)
    tmp_path = f.name
    try:
        cmd = ["npx.cmd" if os.name == "nt" else "npx", "esbuild", tmp_path]
        proc = await asyncio.create_subprocess_exec(*cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=str(remotion_dir))
        _, stderr = await proc.communicate()
        os.remove(tmp_path)
        return json.dumps({"status": "success"}) if proc.returncode == 0 else json.dumps({"status": "error", "errors": stderr.decode()[:1000]})
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        return json.dumps({"error": str(e)})

class YouTubeIdeaAgent:
    def __init__(self, llm_engine: str = "gemma3:1b", api_key: str = "", api_keys: dict = None):
        self.llm_engine = llm_engine
        self.api_key = api_key or os.environ.get("YOUTUBE_API_KEY", "")
        self.api_keys = api_keys or {}

    async def _call_llm(self, system_prompt: str, user_prompt: str, json_format: bool = False, max_tokens: int = 3000, tools: list = None, available_functions: dict = None) -> str:
        engine = self.llm_engine
        try:
            if "/" in engine:
                from app.services.llm_client import MultiProviderClient
                client = MultiProviderClient(router_key=self.api_keys.get("routerai", ""), aitunnel_key=self.api_keys.get("aitunnel", ""))
                for attempt in range(3):
                    res = await client.chat(
                        model=engine,
                        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
                        response_format={"type": "json_object"} if json_format else None,
                        max_tokens=max_tokens,
                        tools=tools,
                        available_functions=available_functions
                    )
                    if res is None:
                        return '{"error": "Шлюзы API недоступны (RouterAI/AITunnel) или вернули пустой ответ."}'
                    if res.strip():
                        return res
                    await asyncio.sleep(1)
                return '{"error": "Шлюз трижды вернул пустой ответ."}'
            else:
                from app.services.llama_local import resolve_gguf, local_generate
                if resolve_gguf(engine):
                    prompt_suffix = "\nОТВЕТЬ СТРОГО В ФОРМАТЕ JSON." if json_format else ""
                    return await local_generate(engine, system_prompt, user_prompt + prompt_suffix, tools=tools, available_functions=available_functions) or ""
                else:
                    payload = {"model": engine, "prompt": f"{system_prompt}\n\n{user_prompt}", "stream": False}
                    if json_format:
                        payload["format"] = "json"
                    async with httpx.AsyncClient(timeout=180.0) as client:
                        res = await client.post("http://127.0.0.1:11434/api/generate", json=payload)
                        if res.status_code == 200:
                            return res.json().get("response", "")
                        return f'{{"error": "Ошибка Ollama: {res.status_code}"}}'
        except Exception as e:
            return f'{{"error": "{str(e)}"}}'

    def _extract_json(self, raw: str) -> dict:
        clean = raw.strip()
        if "```json" in clean:
            clean = clean.split("```json")[1].split("```")[0]
        elif "```" in clean:
            clean = clean.split("```")[1].split("```")[0]
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

    async def suggest_competitors(self, niche: str, skills_text: str = "") -> dict:
        data = {}
        for attempt in range(3):
            prompt = f"Ты эксперт по YouTube. Назови 10 самых популярных и активных YouTube-каналов в нише: '{niche}'. Верни ТОЛЬКО валидный JSON: {{\"channels\": [\"ChannelName1\", \"ChannelName2\"]}}."
            if skills_text:
                prompt += f"\n\n{skills_text}"
            res = await self._call_llm(prompt, "", json_format=True, max_tokens=300)
            data = self._extract_json(res)
            if data.get("channels"):
                return data
            await asyncio.sleep(1)
        return data

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
            prompt = f"Проанализируй описание YouTube-канала и названия последних видео.\nКратко (2-3 предложения) от первого лица напиши суть: о чем канал и для кого.\n\nОписание:\n{description}\n\nВидео:\n{videos_text}"
            return (await self._call_llm("Ты эксперт по YouTube.", prompt, max_tokens=300)).strip()

    async def run_pipeline(self, user_query: str, settings: Dict[str, Any], project_path: str) -> AsyncGenerator[str, None]:
        def yield_log(msg: str, status: str = "info"):
            return json.dumps({"type": "log", "message": msg, "status": status}) + "\n"

        lang_code = settings.get("language", "ru")
        lang_map = {"ru": "Russian", "en": "English", "es": "Spanish"}
        target_lang = lang_map.get(lang_code, "Russian")
        channel_context = settings.get("channel_context", "")

        yield yield_log(f"🤖 Запуск пайплайна 2.0. Язык: {target_lang}")

        search_mode = settings.get("search_mode", "trending")
        search_engine = settings.get("search_engine", "api")

        if search_mode == "competitors":
            channels = settings.get("channels", [])
            if not channels:
                yield yield_log("❌ Список каналов пуст.", "error")
                return

            yield yield_log(f"🕵️ Ищу аномалии на {len(channels)} каналах конкурентов...")
            raw_videos = await YouTubeSearcher.search_channel_outliers(
                channels=channels, days_back=settings.get("days_back", 90),
                min_ratio=settings.get("min_ratio", 2.0), api_key=self.api_key,
                video_type=settings.get("video_type", "all")
            )
        else:
            base_queries = [q.strip() for q in user_query.split(",") if q.strip()]
            queries = base_queries.copy()

            if search_engine != "mcp":
                yield yield_log("📊 Анализ мультиплатформенных трендов (YT, Google, Yandex)...")
                trends_data = await TrendAnalyzer.get_combined_trends(base_queries[0], lang_code)
                prompt = f"Сгенерируй 3 поисковых трендовых запроса на {target_lang} на основе темы '{base_queries[0]}'. Верни JSON: {{\"queries\": [\"...\"]}}"
                llm_res = await self._call_llm(prompt, "", json_format=True, max_tokens=500)
                data = self._extract_json(llm_res)
                if isinstance(data.get("queries"), list) and len(data["queries"]) > 0:
                    queries = data["queries"]

            yield yield_log("🕵️ Поиск вирусных видео...")
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

        yield yield_log(f"🔥 Найдено {len(raw_videos)} чистых аномалий!", "success")
        yield json.dumps({"type": "videos_ready", "results": raw_videos}) + "\n"

        for vid in raw_videos[:3]:
            meta = await asyncio.to_thread(
                YouTubeParser.download_metadata_and_subs,
                vid["url"],
                os.path.join(project_path, "assets", "refs"),
                lang_code,
                vid["video_id"]
            )
            vid["transcript_sample"] = meta.get("transcript_sample", "")

        excel_path = await asyncio.to_thread(YouTubeExporter.to_excel, raw_videos, project_path)
        yield json.dumps({"type": "excel_ready", "excel_path": excel_path}) + "\n"

        analysis_prompt = f"Проанализируй вирусные видео и сгенерируй {settings.get('ideas_count', 5)} идей. Верни JSON: {{\"ideas\": [{{\"titles\": [\"...\"], \"description\": \"...\", \"thumbnail_concept\": \"...\"}}], \"conclusions\": [\"...\"]}}"
        videos_context = "\n".join([f"- Title: {v['title']}\n  Stats: {v['views']} views, x{v['ratio']}\n  Transcript: {(v.get('transcript_sample') or '')[:500]}..." for v in raw_videos[:3]])

        final_analysis = await self._call_llm(analysis_prompt, videos_context, json_format=True, max_tokens=4000)
        analysis_data = self._extract_json(final_analysis)

        yield yield_log("✅ Итог анализа готов!", "success")
        yield json.dumps({"type": "done", "analysis": analysis_data}) + "\n"

    async def analyze_hook(self, transcript: str, skills_text: str = "") -> dict:
        sample = " ".join(transcript.split()[:150])
        prompt = f"Проанализируй хук (первые секунды видео):\n{sample}\nВыдели психологию и предложи 3 адаптации. Верни JSON: {{\"original_hook\": \"...\", \"psychology\": \"...\", \"stolen_hooks\": [\"...\"]}}"
        if skills_text:
            prompt += f"\n\n{skills_text}"
        res = await self._call_llm(prompt, "", json_format=True, max_tokens=1000)
        return self._extract_json(res)

    async def draft_script(self, title: str, description: str, context: str, lang: str = "ru", video_type: str = "long", target_duration: str = "3", custom_prompt: str = "", audio_engine: str = "") -> str:
        lang_map = {"ru": "Russian", "en": "English", "es": "Spanish"}
        target = lang_map.get(lang, "Russian")

        _LOCAL_TTS_MARKERS = ("omnivoice", "qwen-tts", "moss-tts", "silero", "fish", "s2")
        is_local_tts = any(m in audio_engine.lower() for m in _LOCAL_TTS_MARKERS)
        voice_rules = LOCAL_VOICE_RULES if is_local_tts else MINIMAX_VOICE_RULES

        base_prompt_path = os.path.join(os.path.dirname(__file__), "prompts", "tech_scriptwriter_base.md")
        skill_text = ""
        if os.path.exists(base_prompt_path):
            with open(base_prompt_path, "r", encoding="utf-8") as f:
                skill_text = f.read().replace("{{VOICE_RULES}}", voice_rules)

        if custom_prompt:
            prompt = custom_prompt
            system = "Ты профессиональный сценарист YouTube для faceless-канала."
        else:
            target_dur_float = 3.0
            try:
                if target_duration:
                    target_dur_float = float(target_duration)
            except Exception:
                pass
            words_count = int(target_dur_float * 150)
            prompt = f"Напиши сценарий для видео: '{title}'. Описание: {description}. Длительность: {target_duration} мин (~{words_count} слов). Язык: {target}."
            system = skill_text if skill_text else f"You are a professional YouTube scriptwriter. Language: {target}."

        res = await self._call_llm(system, prompt, max_tokens=3000)
        return res.strip()
