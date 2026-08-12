import os
import json
import httpx
import asyncio
from typing import AsyncGenerator, Dict, Any

from app.services.yt_searcher import YouTubeSearcher
from app.services.yt_parser import YouTubeParser
from app.services.yt_exporter import YouTubeExporter
from app.services.trend_analyzer import TrendAnalyzer

MCP_SYSTEM_PROMPT = """Ты — ИИ-агент Vidora с доступом к консольным инструментам для исследования YouTube. Твоя задача — находить вирусные видео по теме пользователя и возвращать их в строгом JSON.

## Доступные инструменты (вызывай через function calling)

1. search_youtube(query: string)
   Назначение: поиск свежих вирусных видео по запросу.
   Возвращает: JSON-массив видео (video_id, title, channel, views, subs, ratio, vph, url, published_at, duration_sec, is_short).

2. download_youtube(url: string, format?: "video" | "audio" = "video")
   Назначение: скачать видео (mp4) или аудио (wav) с YouTube через yt-dlp.
   Возвращает: {"status": "success", "path": "абсолютный путь к файлу"}.
   Параметры:
   - url — полный URL видео (бери из результата search_youtube).
   - format — "video" (mp4) или "audio" (wav).

3. ffmpeg_process(input_path: string, action: "trim" | "extract_audio", start_time?: "HH:MM:SS", end_time?: "HH:MM:SS")
   Назначение: обработка скачанного медиафайла.
   - action="extract_audio" — извлечь звуковую дорожку в wav.
   - action="trim" — вырезать фрагмент [start_time, end_time].
   input_path — путь, полученный из download_youtube.
   Возвращает: {"status": "success", "path": "путь к результату"}.

## Основные кейсы и какие инструменты вызывать

1. Поиск идей/трендов: ОБЯЗАТЕЛЬНО вызови search_youtube(тема).
2. Анализ контента конкурента (нужны транскрипция/контент):
   цепочка search_youtube -> download_youtube(url, format="video") -> ffmpeg_process(path, action="extract_audio").
3. Только аудио для анализа: search_youtube -> download_youtube(url, format="audio").
4. Обрезка фрагмента видео: download_youtube(url, format="video") -> ffmpeg_process(path, action="trim", start_time="00:00:05", end_time="00:00:30").

## Правила вызова инструментов

- Вызывай инструменты ПО ОДНОМУ: дождись результата, прежде чем вызывать следующий. В цепочках (download_youtube -> ffmpeg_process) передавай path из ответа предыдущего вызова, не выдумывай пути.
- Передавай ВСЕ обязательные параметры, указанные в схеме инструмента.
- Если инструмент вернул {"status": "error", ...} (например, файл не найден или скачивание заблокировано) — не прерывай работу: пропусти неудачный шаг и продолжай (например, верни результаты поиска без скачивания).
- Не придумывай данные — используй только реальные результаты инструментов.

## Финальный ответ

Верни СТРОГО валидный JSON без markdown-обёртки:
{"videos": [{"video_id": "...", "title": "...", "channel": "...", "views": 100, "subs": 10, "ratio": 1.5, "vph": 10, "url": "...", "published_at": "2024-01-01T00:00:00Z", "duration_sec": 300, "is_short": false}]}"""


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
                # ponytail: deepseek-v4-flash через шлюз флаки — пустой ответ повторяем
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
                    print(f"[YT_AGENT] Пустой ответ LLM, повтор {attempt + 1}/3...")
                    await asyncio.sleep(1)
                return '{"error": "Шлюз трижды вернул пустой ответ."}'
            else:
                from app.services.llama_local import resolve_gguf, local_generate
                if resolve_gguf(engine):
                    prompt_suffix = "\nОТВЕТЬ СТРОГО В ФОРМАТЕ JSON." if json_format else ""
                    return await local_generate(engine, system_prompt, user_prompt + prompt_suffix, tools=tools, available_functions=available_functions) or ""
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
        # Ищем блок markdown и вырезаем его содержимое, даже если до него был текст
        if "```json" in clean:
            clean = clean.split("```json")[1].split("```")[0]
        elif "```" in clean:
            clean = clean.split("```")[1].split("```")[0]

        try:
            return json.loads(clean.strip())
        except Exception:
            # Агрессивный фоллбек: ищем первые и последние фигурные скобки
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
            prompt = f"Ты эксперт по YouTube. Назови 10 самых популярных и активных YouTube-каналов в нише: '{niche}'. Верни ТОЛЬКО валидный JSON в формате: {{\"channels\": [\"ChannelName1\", \"ChannelName2\"]}}. Без лишнего текста."
            if skills_text:
                prompt += f"\n\n{skills_text}"
            res = await self._call_llm(prompt, "", json_format=True, max_tokens=300)
            data = self._extract_json(res)
            if data.get("channels"):
                return data
            print(f"[YT_AGENT] suggest_competitors: пустой/невалидный JSON, повтор {attempt + 1}/3...")
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
        search_engine = settings.get("search_engine", "api")

        if search_mode == "competitors":
            channels = settings.get("channels", [])
            if not channels:
                yield yield_log("❌ Список каналов пуст.", "error")
                return

            if search_engine == "ai":
                yield yield_log(f"🧠 ИИ самостоятельно генерирует аномалии для {len(channels)} каналов (Без API)...")
                prompt = f"""Ты ИИ-агент по YouTube. Сгенерируй 10 вирусных видео для каналов: {', '.join(channels)}.
Они должны выглядеть реалистично.
Возраст: за последние {settings.get('days_back', 90)} дней.
Просмотры превышают средние по каналу в {settings.get('min_ratio', 2.0)} раз.
Верни JSON в формате:
{{"videos": [{{"video_id": "rand11chars", "title": "Название", "channel": "Канал", "views": 100000, "subs": 10000, "ratio": 3.0, "vph": 100, "url": "https://youtu.be/rand11chars", "published_at": "2024-01-01T00:00:00Z", "duration_sec": 300, "is_short": false}}]}}"""
                llm_res = await self._call_llm("Ты эксперт по YouTube.", prompt, json_format=True, max_tokens=3000)
                raw_videos = self._extract_json(llm_res).get("videos", [])
            elif search_engine == "script":
                yield yield_log("⚙️ Скриптовый поиск по каналам пока не поддерживается, fallback на API...", "warning")
                raw_videos = await YouTubeSearcher.search_channel_outliers(
                    channels=channels, days_back=settings.get("days_back", 90),
                    min_ratio=settings.get("min_ratio", 2.0), api_key=self.api_key,
                    video_type=settings.get("video_type", "all")
                )
            else:
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

                if "error" in data:
                    yield yield_log(f"❌ Ошибка LLM (генерация запросов): {data['error']}", "error")

                if isinstance(data.get("queries"), list) and len(data["queries"]) > 0:
                    queries = data["queries"]
                    yield yield_log(f"📈 Сгенерированы трендовые запросы ({target_lang}): {', '.join(data['queries'])}")
                else:
                    yield yield_log(f"⚠️ ИИ не вернул запросы на {target_lang}, иду по базовым: {', '.join(base_queries)}", "warning")

            if search_engine == "ai":
                yield yield_log("🧠 ИИ самостоятельно генерирует базу вирусных видео (Без API)...")
                prompt = f"""Сгенерируй 10-15 вирусных видео по тематикам: {', '.join(queries)}.
Они должны выглядеть как реальные видео с YouTube.
Параметры фильтрации:
- За последние {settings.get('days_back')} дней
- От {settings.get('min_subs')} до {settings.get('max_subs')} подписчиков
- Отношение просмотров к подписчикам > {settings.get('min_ratio')}
Верни JSON в формате:
{{"videos": [{{"video_id": "rand11chars", "title": "Название", "channel": "Канал", "views": 10000, "subs": 1000, "ratio": 10.0, "vph": 100, "url": "https://youtu.be/rand11chars", "published_at": "2024-01-01T00:00:00Z", "duration_sec": 600, "is_short": false}}]}}"""
                llm_res = await self._call_llm("Ты ИИ-агент по YouTube.", prompt, json_format=True, max_tokens=3000)
                raw_videos = self._extract_json(llm_res).get("videos", [])
            elif search_engine == "script":
                yield yield_log("⚙️ Запуск локального скрипта поиска (yt_search / cli.py)...")
                import subprocess
                try:
                    ps_cmd = f".\\yt_search.ps1 -QueriesCsv '{queries[0]}' -DaysBack {settings.get('days_back')} -MinSubs {settings.get('min_subs')} -MaxSubs {settings.get('max_subs')}"
                    result = await asyncio.to_thread(subprocess.run, ["powershell", "-ExecutionPolicy", "Bypass", "-Command", ps_cmd], capture_output=True, text=True)
                    stdout = result.stdout
                    if not stdout.strip() or "The term" in stdout or "не распознано" in stdout:
                        yield yield_log("⚠️ yt_search.ps1 не сработал, запускаю встроенный cli.py...", "warning")
                        py_cmd = ["python", "cli.py", "yt-search", queries[0], "--days", str(settings.get('days_back')), "--min-subs", str(settings.get('min_subs')), "--max-subs", str(settings.get('max_subs')), "--min-ratio", str(settings.get('min_ratio'))]
                        result = await asyncio.to_thread(subprocess.run, py_cmd, capture_output=True, text=True)
                        stdout = result.stdout

                    if not stdout.strip():
                        yield yield_log("❌ Скрипты не вернули результат.", "error")
                        raw_videos = []
                    else:
                        yield yield_log("🧹 ИИ парсит результаты из вывода скрипта...")
                        parse_prompt = f"""Извлеки данные о видео из лога консоли:
{stdout[:3000]}
Верни строгий JSON:
{{"videos": [{{"video_id": "из url", "title": "...", "channel": "...", "views": 100, "subs": 10, "ratio": 1.5, "vph": 10, "url": "...", "published_at": "2024-01-01T00:00:00Z", "duration_sec": 300, "is_short": false}}]}}"""
                        llm_res = await self._call_llm("Ты ИИ-парсер логов.", parse_prompt, json_format=True, max_tokens=3000)
                        raw_videos = self._extract_json(llm_res).get("videos", [])
                except Exception as e:
                    yield yield_log(f"❌ Ошибка вызова скрипта: {e}", "error")
                    raw_videos = []
            elif search_engine == "mcp":
                yield yield_log("🔌 Активирован MCP-Агент (Tool Calling). LLM имеет доступ к yt-dlp и ffmpeg...")
                tools = [
                    {
                        "type": "function",
                        "function": {
                            "name": "search_youtube",
                            "description": "Ищет свежие вирусные видео на YouTube.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "query": {"type": "string", "description": "Поисковый запрос"}
                                },
                                "required": ["query"]
                            }
                        }
                    },
                    {
                        "type": "function",
                        "function": {
                            "name": "download_youtube",
                            "description": "Скачивает видео или аудио с YouTube с помощью yt-dlp. Возвращает абсолютный путь к файлу.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "url": {"type": "string", "description": "URL видео на YouTube"},
                                    "format": {"type": "string", "enum": ["video", "audio"], "description": "Формат скачивания"}
                                },
                                "required": ["url"]
                            }
                        }
                    },
                    {
                        "type": "function",
                        "function": {
                            "name": "ffmpeg_process",
                            "description": "Обрабатывает медиафайл (обрезка, извлечение аудио) с помощью FFmpeg.",
                            "parameters": {
                                "type": "object",
                                "properties": {
                                    "input_path": {"type": "string", "description": "Абсолютный путь к исходному файлу"},
                                    "action": {"type": "string", "enum": ["trim", "extract_audio"], "description": "Действие"},
                                    "start_time": {"type": "string", "description": "Время начала в формате HH:MM:SS (для trim)"},
                                    "end_time": {"type": "string", "description": "Время конца в формате HH:MM:SS (для trim)"}
                                },
                                "required": ["input_path", "action"]
                            }
                        }
                    }
                ]

                async def mcp_search_youtube(query: str):
                    print(f"[MCP] Выполнение инструмента поиска для: {query}")
                    vids = await YouTubeSearcher.search_viral_videos(
                        queries=[query], days_back=settings.get("days_back", 7),
                        min_subs=settings.get("min_subs", 1000), max_subs=settings.get("max_subs", 50000),
                        min_ratio=settings.get("min_ratio", 1.5), api_key=self.api_key,
                        language=lang_code, video_type=settings.get("video_type", "all")
                    )
                    return json.dumps(vids[:10], ensure_ascii=False)

                async def mcp_download_youtube(url: str, format: str = "video"):
                    print(f"[MCP] yt-dlp скачивает: {url} ({format})")
                    import subprocess
                    import uuid
                    out_dir = os.path.abspath(os.path.join(project_path, "assets", "downloads"))
                    os.makedirs(out_dir, exist_ok=True)
                    file_id = str(uuid.uuid4())[:8]

                    if format == "audio":
                        cmd = ["yt-dlp", "-x", "--audio-format", "wav", "-o", f"{out_dir}/{file_id}.%(ext)s", url]
                        ext = "wav"
                    else:
                        cmd = ["yt-dlp", "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4", "-o", f"{out_dir}/{file_id}.%(ext)s", url]
                        ext = "mp4"

                    process = await asyncio.create_subprocess_exec(*cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    await process.communicate()
                    return json.dumps({"status": "success", "path": f"{out_dir}/{file_id}.{ext}"})

                async def mcp_ffmpeg_process(input_path: str, action: str, start_time: str = None, end_time: str = None):
                    print(f"[MCP] ffmpeg обрабатывает: {input_path} ({action})")
                    import subprocess
                    import uuid
                    if not os.path.exists(input_path):
                        return json.dumps({"status": "error", "message": "File not found"})

                    out_dir = os.path.dirname(input_path)
                    file_id = str(uuid.uuid4())[:8]
                    cmd = ["ffmpeg", "-y"]

                    if start_time:
                        cmd.extend(["-ss", start_time])
                    if end_time:
                        cmd.extend(["-to", end_time])

                    cmd.extend(["-i", input_path])

                    if action == "trim":
                        ext = input_path.split('.')[-1]
                        out_path = f"{out_dir}/{file_id}_trimmed.{ext}"
                        cmd.extend(["-c", "copy", out_path])
                    elif action == "extract_audio":
                        out_path = f"{out_dir}/{file_id}_audio.wav"
                        cmd.extend(["-vn", "-acodec", "pcm_s16le", "-ar", "44100", "-ac", "2", out_path])

                    process = await asyncio.create_subprocess_exec(*cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                    await process.communicate()
                    return json.dumps({"status": "success", "path": out_path})

                available_funcs = {
                    "search_youtube": mcp_search_youtube,
                    "download_youtube": mcp_download_youtube,
                    "ffmpeg_process": mcp_ffmpeg_process
                }

                mcp_user_extra = ""
                if channel_context:
                    mcp_user_extra += f"\nКонтекст канала пользователя: {channel_context}\n"
                mcp_skills = settings.get("skills_text", "")
                if mcp_skills:
                    mcp_user_extra += f"\nДополнительные инструкции (скиллы):\n{mcp_skills}\n"

                prompt = f"""Используй доступные инструменты:
1. search_youtube - Обязательно вызови для поиска видео по темам: {', '.join(queries)}.
2. download_youtube - (Опционально) Можешь скачать 1-2 видео или аудио из результатов.
3. ffmpeg_process - (Опционально) Можешь обрезать скачанное видео или вытащить звук.
{mcp_user_extra}
Алгоритм:
1. Обязательно выполни поиск search_youtube.
2. Проанализируй данные, выбери 10 лучших видео.
3. Если считаешь нужным, скачай видео через download_youtube, дождись пути к файлу, затем вызови ffmpeg_process.
4. В конце верни результат СТРОГО в формате JSON:
{{"videos": [{{"video_id": "...", "title": "...", "channel": "...", "views": 100, "subs": 10, "ratio": 1.5, "vph": 10, "url": "...", "published_at": "2024-01-01T00:00:00Z", "duration_sec": 300, "is_short": false}}]}}"""
                llm_res = await self._call_llm(MCP_SYSTEM_PROMPT, prompt, json_format=True, max_tokens=3000, tools=tools, available_functions=available_funcs)
                data = self._extract_json(llm_res)
                raw_videos = data.get("videos", [])
            else:
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

        yield yield_log("📥 Подготовка транскрипций топ-3 роликов для глубокого анализа...")
        for idx, vid in enumerate(final_videos[:3]):
            if search_engine == "ai":
                yield yield_log(f"🧠 ИИ генерирует транскрипцию для '{vid['title']}'...")
                prompt = f"Напиши примерную транскрипцию (первые 3-4 абзаца) для несуществующего видео с названием '{vid['title']}' на тему '{user_query}'. Язык: {target_lang}."
                fake_transcript = await self._call_llm("Ты сценарист YouTube.", prompt, max_tokens=1000)
                vid["transcript_sample"] = fake_transcript
            else:
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

        skills_text = settings.get("skills_text", "")
        if skills_text:
            analysis_prompt += f"\n\n{skills_text}"

        final_analysis = await self._call_llm(analysis_prompt, videos_context, json_format=True, max_tokens=4000)
        analysis_data = self._extract_json(final_analysis)

        if "error" in analysis_data:
            yield yield_log(f"❌ Ошибка LLM (генерация идей): {analysis_data['error']}", "error")
            yield json.dumps({"type": "done", "analysis": {}}) + "\n"
            return

        if not analysis_data.get("ideas"):
            yield yield_log("⚠️ ИИ не вернул идеи в правильном формате JSON. Смените LLM движок.", "warning")

        yield yield_log("✅ Итог анализа готов!", "success")
        yield json.dumps({"type": "done", "analysis": analysis_data}) + "\n"

    async def analyze_hook(self, transcript: str, skills_text: str = "") -> dict:
        """Анализирует первые 30 сек видео и крадет хук"""
        words = transcript.split()[:150]
        sample = " ".join(words)
        data = {}
        for attempt in range(3):
            prompt = """Analyze the hook (first 30 seconds) of this viral YouTube video.
Return a JSON object with:
1. "original_hook": The actual hook extracted.
2. "psychology": Briefly explain WHY it works (open loop, fear, promise, etc).
3. "stolen_hooks": An array of 3 new, original hooks using the EXACT same psychological formula, but adapted for a general tech/software topic.
Language: Russian."""
            if skills_text:
                prompt += f"\n\n{skills_text}"
            res = await self._call_llm(prompt, f"TRANSCRIPT:\n{sample}", json_format=True, max_tokens=1000)
            data = self._extract_json(res)
            if data:
                return data
            print(f"[YT_AGENT] analyze_hook: пустой/невалидный JSON, повтор {attempt + 1}/3...")
            await asyncio.sleep(1)
        return data

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