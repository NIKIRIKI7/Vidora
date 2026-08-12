import os
import json
import re
import glob
import subprocess
import httpx
from datetime import datetime, timedelta, timezone


class YouTubeManager:
    """Ресёрч-инструмент: поиск вирусных идей (outlier detection), yt-dlp метаданные, промптология превью."""

    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("YOUTUBE_API_KEY")
        self.base_url = "https://www.googleapis.com/youtube/v3"

    async def search_ideas(self, query: str, days_back: int = 7, min_subs: int = 1000,
                           max_subs: int = 100000, min_ratio: float = 1.0):
        """Поиск видео, где просмотры сильно превышают подписчиков канала (outlier detection)."""
        if not self.api_key:
            raise ValueError("YOUTUBE_API_KEY не задан (backend/.env)")
        if not query.strip():
            return []

        published_after = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime('%Y-%m-%dT%H:%M:%SZ')

        async with httpx.AsyncClient(timeout=30.0) as client:
            search_res = await client.get(f"{self.base_url}/search", params={
                "part": "snippet", "q": query, "type": "video",
                "publishedAfter": published_after, "maxResults": 50,
                "relevanceLanguage": "en", "key": self.api_key,
            })
            search_data = search_res.json()
            if "items" not in search_data:
                return []

            video_ids = [item["id"]["videoId"] for item in search_data["items"]]
            channel_ids = list({item["snippet"]["channelId"] for item in search_data["items"]})

            videos_res = await client.get(f"{self.base_url}/videos", params={
                "part": "statistics", "id": ",".join(video_ids), "key": self.api_key,
            })
            videos_data = {item["id"]: item for item in videos_res.json().get("items", [])}

            channels_res = await client.get(f"{self.base_url}/channels", params={
                "part": "statistics", "id": ",".join(channel_ids), "key": self.api_key,
            })
            channels_data = {item["id"]: item for item in channels_res.json().get("items", [])}

            results = []
            for item in search_data["items"]:
                v_id = item["id"]["videoId"]
                c_id = item["snippet"]["channelId"]

                v_stat = videos_data.get(v_id, {}).get("statistics", {})
                c_stat = channels_data.get(c_id, {}).get("statistics", {})

                views = int(v_stat.get("viewCount", 0))
                subs = int(c_stat.get("subscriberCount", 0))
                if subs == 0:
                    continue

                ratio = views / subs
                if min_subs <= subs <= max_subs and ratio >= min_ratio:
                    results.append({
                        "video_id": v_id,
                        "title": item["snippet"]["title"],
                        "channel": item["snippet"]["channelTitle"],
                        "views": views,
                        "subs": subs,
                        "ratio": round(ratio, 2),
                        "url": f"https://youtu.be/{v_id}",
                        "published_at": item["snippet"]["publishedAt"],
                    })

            return sorted(results, key=lambda x: x["ratio"], reverse=True)

    @staticmethod
    def _parse_json(text: str) -> dict:
        """Надёжный парсер: маленькие модели любят ```json```-блоки и лишний текст."""
        if not text:
            return {}
        match = re.search(r'\{.*\}', text, re.DOTALL)
        raw = match.group(0) if match else text
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            data = {}
        return data if isinstance(data, dict) else {}

    def download_meta(self, video_url: str, output_dir: str):
        """Скачивание превью, info-json и автосубтитров через yt-dlp (без самого видео)."""
        abs_output_dir = os.path.abspath(output_dir)
        os.makedirs(abs_output_dir, exist_ok=True)

        cmd = [
            "yt-dlp", "--skip-download",
            "--write-auto-sub", "--sub-format", "vtt", "--sub-lang", "en,ru,en-US",
            "--write-thumbnail", "--write-info-json",
            "-o", f"{abs_output_dir}/%(id)s.%(ext)s",
            video_url,
        ]
        print(f"[YT-DLP] Выполнение: {' '.join(cmd)}")

        # ВАЖНО: без check=True — yt-dlp вернёт код 1, если какого-то языка субтитров нет, это не ошибка
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if result.returncode != 0:
                print(f"[YT-DLP WARNING] Код {result.returncode}. Это нормально, если у видео нет сабов.")
        except Exception as e:
            print(f"[YT-DLP ERROR] Ошибка запуска yt-dlp: {e}")

        video_id = video_url.split("v=")[-1].split("&")[0] if "v=" in video_url \
            else video_url.rstrip("/").split("/")[-1].split("?")[0]

        # Транскрипция: любой скачанный VTT (glob вместо жёсткой привязки к en/ru)
        transcript = ""
        vtt_files = sorted(glob.glob(os.path.join(abs_output_dir, f"{video_id}*.vtt")))
        if vtt_files:
            try:
                with open(vtt_files[0], "r", encoding="utf-8") as f:
                    raw_vtt = f.read()
                cleaned = re.sub(r'<[^>]+>', '', raw_vtt)
                cleaned = re.sub(r'[\d]{2}:[\d]{2}:[\d]{2}\.[\d]{3} --> .*', '', cleaned)
                cleaned = re.sub(r'WEBVTT|Kind: captions|Language: .*', '', cleaned)
                lines = [l.strip() for l in cleaned.split("\n") if l.strip()]
                transcript = re.sub(r'\s+', ' ', " ".join(lines))
            except Exception as e:
                print(f"[YT-DLP] Ошибка чтения VTT: {e}")

        # Название и канал из info.json (для CLI-режима и отчёта)
        title, channel = "", ""
        info_path = os.path.join(abs_output_dir, f"{video_id}.info.json")
        if os.path.exists(info_path):
            try:
                with open(info_path, "r", encoding="utf-8") as f:
                    info = json.load(f)
                title = info.get("title") or ""
                channel = info.get("channel") or ""
            except Exception:
                pass

        # Превью: yt-dlp может сохранить webp, jpg или png
        thumbnail_path = ""
        for ext in ("webp", "jpg", "png"):
            p = os.path.join(abs_output_dir, f"{video_id}.{ext}")
            if os.path.exists(p):
                thumbnail_path = p
                break

        return {
            "video_id": video_id,
            "title": title,
            "channel": channel,
            "thumbnail_path": thumbnail_path,
            "transcript_sample": (transcript[:1500] + "...") if len(transcript) > 1500 else transcript,
            "transcript_full": transcript,
        }

    async def generate_thumbnail_prompt(self, video_title: str, transcript: str, engine: str, api_keys: dict):
        """Генерация концепта превью: локально (Ollama) или облако (RouterAI → AITUNNEL фоллбэк)."""
        system_prompt = """Ты элитный арт-директор и эксперт по YouTube CTR для IT/Tech faceless-каналов. 
Твоя задача — сгенерировать концепт сверхкликабельного превью, строго следуя гайдлайнам DESIGN.md.

ГЛАВНЫЕ ПРАВИЛА (Правило 1 фокуса):
1. Структура из 3 элементов: Главный визуальный якорь + Текст (≤5 слов) + 1 Акцент.
2. Curiosity Gap: Текст на превью должен интриговать, а не дублировать заголовок видео.
3. Эмоция важнее сухой информации. Передавай шок, страх ошибки, срочность, профит или любопытство через визуальные заменители (warning-знаки, красные рамки, глитч, неон, ракеты).

ДОСТУПНЫЕ LAYOUT-СХЕМЫ (выбери одну):
- A: Объект слева — текст справа (универсальный).
- B: Текст по центру — размытый код/IDE фоном (для туториалов).
- C: Сплит-экран (для сравнений / VS-видео).
- D: Список / ТОП (иконки 1, 2, 3 крупно).
- E: До / После (тусклое -> яркое, 🐌 -> 🚀).

ДОСТУПНЫЕ ЦВЕТОВЫЕ ПРЕСЕТЫ (выбери один):
- Terminal: Фон #0D1117, Акцент #00FF88 (код, успех).
- Warning: Фон #1A0A0A, Акцент #FF3B30 (баги, страх, срочность).
- AI/Future: Фон #1A1A2E, Акцент #A855F7 (нейросети, футуризм).
- Money/Career: Фон #0F172A, Акцент #FFD60A (выгода, внимание).
- Comparison: Фон #0F172A, Акценты #3B82F6 и #F97316.

Верни СТРОГО валидный JSON в следующем формате:
{
  "text_on_thumbnail": "ТЕКСТ (3-5 слов МАКСИМУМ, UPPERCASE, мощная интрига или триггер, без стоп-слов)",
  "layout_type": "Выбранная буква схемы (A, B, C, D или E)",
  "color_palette": {
    "background": "#HexColor",
    "accent": "#HexColor",
    "text": "#HexColor"
  },
  "midjourney_prompt": "Развернутый промпт для Midjourney на АНГЛИЙСКОМ языке (40-80 слов). Опиши главный визуальный объект (например: 3d floating holographic python icon, glowing neon warning sign, cute minimal robot mascot), детали фона (matrix style green code blur, dark tech environment, deep space bokeh), освещение (dramatic rim light, glowing neon accents, cinematic) и стиль рендера. Не проси нейросеть писать текст, описывай только чистый визуал. Обязательно закончи строкой: --ar 16:9 --v 6.0 --style raw",
  "explanation": "Объяснение (1-2 предложения), почему этот концепт пробьет баннерную слепоту: какая эмоция, визуальный хук или боль ЦА (curiosity gap) задействованы."
}

ВАЖНО: Верни ТОЛЬКО JSON. Без markdown-разметки ```json, без вводных слов. Поле midjourney_prompt должно быть настоящим, детальным англоязычным промптом, готовым к копированию в Discord."""
        user_prompt = f"Заголовок видео: {video_title}\n\nКраткая суть из транскрипции:\n{transcript}\n\nСгенерируй концепт превью."

        # ponytail: '/' в имени = облачная модель через RouterAI/AITUNNEL, иначе локальная (GGUF из ai-models или Ollama)
        if "/" in engine:
            from app.services.llm_client import MultiProviderClient
            ai = MultiProviderClient(
                router_key=api_keys.get("routerai", ""),
                aitunnel_key=api_keys.get("aitunnel", ""),
            )
            text = await ai.chat(
                model=engine,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=2000,
            )
        else:
            from app.services.llama_local import local_generate
            text = await local_generate(engine, system_prompt, user_prompt)
            if text is None:
                # Нет GGUF под этот движок в ai-models — фоллбэк на Ollama
                print(f"[YT_MANAGER] Локальная модель Ollama: {engine}")
                async with httpx.AsyncClient() as client:
                    res = await client.post(
                        "http://127.0.0.1:11434/api/generate",
                        json={
                            "model": engine,
                            "prompt": f"{system_prompt}\n\n{user_prompt}",
                            "stream": False,
                            "format": "json",
                        },
                        timeout=120.0,
                    )
                    if res.status_code != 200:
                        raise RuntimeError(f"Ошибка Ollama ({engine}): {res.status_code} — запущен ли ollama serve?")
                    text = res.json().get("response", "")

        concept = self._parse_json(text)
        if not concept:
            raise RuntimeError(f"AI самопроверка: невалидный JSON: {str(text)[:200]}")
        return concept


if __name__ == "__main__":
    # самопроверка честна без сети: парсер JSON
    assert YouTubeManager._parse_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert YouTubeManager._parse_json("Here: {\"b\": 2} end") == {"b": 2}
    assert YouTubeManager._parse_json("plain text") == {}
    assert YouTubeManager._parse_json('{"x": [1, 2]}') == {"x": [1, 2]}
    print("yt_manager JSON parser OK")