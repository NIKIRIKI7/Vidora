import json
import re
import httpx
from pathlib import Path
from typing import Dict, Any

# Путь к документу с правилами дизайна превью: backend/app/services -> корень репо
DESIGN_DOC_PATH = Path(__file__).resolve().parents[3] / "docs" / "design" / "DESIGN.md"


class ThumbnailPromptEngine:
    """
    Генератор концептов превью на базе правил vidIQ (docs/design/DESIGN.md).
    Строго форматирует ответ в JSON для использования на фронтенде.
    """

    def __init__(self):
        self._design_rules = self._load_design_rules()

    def _load_design_rules(self) -> str:
        """Считывает markdown файл с правилами дизайна (DESIGN.md)."""
        try:
            if DESIGN_DOC_PATH.exists():
                with open(DESIGN_DOC_PATH, "r", encoding="utf-8") as f:
                    return f.read()
            print(f"[WARN] Файл с правилами не найден: {DESIGN_DOC_PATH}")
            return "Правила дизайна не найдены. Создайте контрастное превью, текст до 5 слов."
        except Exception as e:
            print(f"[ERROR] Ошибка чтения DESIGN.md: {e}")
            return "Ошибка чтения правил."

    def _extract_json(self, text: str) -> Dict[str, Any]:
        """Безопасно извлекает JSON из ответа LLM, даже если она добавила лишний текст."""
        try:
            # Ищем блок ```json ... ```
            match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
            if match:
                return json.loads(match.group(1))

            # Если блока нет, ищем просто первые { и последние }
            start = text.find('{')
            end = text.rfind('}')
            if start != -1 and end != -1:
                return json.loads(text[start:end + 1])

            raise ValueError("Не найден JSON в ответе")
        except (json.JSONDecodeError, ValueError):
            print(f"[THUMBNAIL ENGINE] Ответ невалиден. Сырой текст: {text[:200]}...")
            return {
                "layout_type": "A",
                "text_lines": ["ОШИБКА", "ГЕНЕРАЦИИ"],
                "colors": {"background": "#000000", "accent": "#FF3B30", "text": "#FFFFFF"},
                "emotion_hook": "ошибка",
                "midjourney_prompt": "black screen with error error --ar 16:9",
                "vidiq_score_estimate": 0,
                "explanation": f"LLM вернула невалидный формат. Сырой текст: {text[:100]}"
            }

    async def generate_concept(
        self,
        video_title: str,
        transcript: str,
        engine: str,
        api_keys: dict
    ) -> Dict[str, Any]:
        """Отправляет запрос в LLM для генерации схемы превью."""
        system_prompt = f"""Ты — топовый арт-директор YouTube-канала (IT-тематика, формат faceless).
Твоя задача — придумать кликабельное превью (CTR > 10%) строго по правилам канала.

ПРАВИЛА КАНАЛА (Основано на vidIQ):
{self._design_rules}

ТРЕБОВАНИЯ К ОТВЕТУ:
Ты обязан вернуть ТОЛЬКО валидный JSON (без маркдауна вокруг, без приветствий).
Схема JSON:
{{
  "layout_type": "A", // Строго из документа (A, B, C, D или E)
  "text_lines": ["AI АГЕНТЫ", "ЗАМЕНЯТ НАС?"], // Строго до 5 слов в сумме, CAPS LOCK, интрига (Curiosity Gap)
  "colors": {{
    "background": "#0D1117", // Тёмный фон из палитры
    "accent": "#A855F7",    // Яркий акцент
    "text": "#FFFFFF"
  }},
  "emotion_hook": "😱 шок / взрыв-эффект / фиолетовое свечение", // Как передать эмоцию без лица
  "midjourney_prompt": "Промпт для нейросети на английском, описывающий только фон и главный объект, без текста. В конце обязательно --ar 16:9",
  "vidiq_score_estimate": 85, // Оценка от 1 до 100 насколько превью соответствует правилам
  "explanation": "Кратко: почему это сработает (разрыв любопытства, контраст и т.д.)"
}}
"""

        # Обрезаем транскрипцию, чтобы не перегружать контекст (хватит 2000 символов)
        short_transcript = transcript[:2000] if transcript else "Нет транскрипции. Ориентируйся только на заголовок."

        user_prompt = f"""Создай превью для этого видео.
ЗАГОЛОВОК ВИДЕО: {video_title}
СУТЬ ВИДЕО (Транскрипция): {short_transcript}

Сгенерируй JSON:"""

        # ponytail: '/' в имени = облачная модель через RouterAI/AITUNNEL, иначе — локальная GGUF -> Ollama
        if "/" in engine:
            from app.services.llm_client import MultiProviderClient
            ai = MultiProviderClient(
                router_key=api_keys.get("routerai", ""),
                aitunnel_key=api_keys.get("aitunnel", ""),
            )
            raw_response = await ai.chat(
                model=engine,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                max_tokens=1500
            )
        else:
            from app.services.llama_local import local_generate
            text = await local_generate(engine, system_prompt, user_prompt)
            if text is None:
                # Нет GGUF под этот движок — фоллбэк на Ollama (JSON mode)
                print(f"[THUMBNAIL ENGINE] Ollama: {engine}")
                try:
                    async with httpx.AsyncClient(timeout=120.0) as client:
                        res = await client.post(
                            "http://127.0.0.1:11434/api/generate",
                            json={"model": engine, "prompt": f"{system_prompt}\n\n{user_prompt}",
                                  "stream": False, "format": "json"},
                        )
                        if res.status_code == 200:
                            raw_response = res.json().get("response", "")
                        else:
                            raw_response = f'{{"explanation": "Ошибка Ollama: {res.status_code}"}}'
                except Exception as e:
                    raw_response = f'{{"explanation": "Ошибка Ollama: {e}"}}'
            else:
                raw_response = text

        return self._extract_json(raw_response)


if __name__ == "__main__":
    # самопроверка честна без сети: парсер JSON
    e = ThumbnailPromptEngine()
    assert e._extract_json('```json\n{"x": 1}\n```') == {"x": 1}
    assert e._extract_json('Вот ответ: {"y": 2} — жми!') == {"y": 2}
    # невалидный текст должен вернуть фоллбэк-концепт, а не упасть
    fallback = e._extract_json("привет, я не знаю json")
    assert fallback["vidiq_score_estimate"] == 0
    print("thumbnail_engine JSON parsing OK")