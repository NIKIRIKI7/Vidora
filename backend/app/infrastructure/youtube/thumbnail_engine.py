"""Генератор концептов и промптов превью (Thumbnails) для Midjourney."""

import re
import json
from pathlib import Path
from typing import Any, Dict, Tuple

from app.core.config import settings
from app.infrastructure.ai.llm.gateway import LLMGateway


class ThumbnailPromptEngine:
    def __init__(self):
        self.design_doc_path = settings.BASE_DIR.parent / "docs" / "design" / "DESIGN.md"

    def load_design_rules(self) -> str:
        try:
            if self.design_doc_path.exists():
                return self.design_doc_path.read_text(encoding="utf-8")
            return "Создайте контрастное кликабельное превью, яркий главный объект, крупный текст до 4 слов."
        except Exception:
            return "Создайте контрастное превью, текст до 4 слов."

    def build_prompts(self, video_title: str, transcript: str) -> Tuple[str, str]:
        rules = self.load_design_rules()
        system_prompt = (
            f"You are a viral YouTube thumbnail designer and art director.\n"
            f"Design rules:\n{rules}\n"
            f"Return ONLY valid JSON format: {{\"layout_type\": \"A\", \"text_lines\": [\"...\"], "
            f"\"colors\": {{\"background\": \"#...\"}}, \"emotion_hook\": \"...\", "
            f"\"midjourney_prompt\": \"... --ar 16:9\", \"vidiq_score_estimate\": 95, \"explanation\": \"...\"}}"
        )
        short_transcript = transcript[:2000] if transcript else "Нет транскрипции."
        user_prompt = f"Video Title: {video_title}\nTranscript Sample:\n{short_transcript}"
        return system_prompt, user_prompt

    @staticmethod
    def parse_concept_json(text: str) -> Dict[str, Any]:
        clean = text.strip()
        match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", clean, re.DOTALL)
        if match:
            clean = match.group(1)
        else:
            start = clean.find("{")
            end = clean.rfind("}")
            if start != -1 and end > start:
                clean = clean[start : end + 1]

        try:
            return json.loads(clean)
        except Exception:
            return {
                "layout_type": "A",
                "text_lines": ["ВИРУСНЫЙ", "КОНТЕНТ"],
                "colors": {"background": "#121212"},
                "emotion_hook": "Шок / Любопытство",
                "midjourney_prompt": "Cinematic visual storytelling, dramatic lighting --ar 16:9",
                "vidiq_score_estimate": 85,
                "explanation": f"LLM вернула нестандартный ответ: {text[:80]}",
            }

    async def generate_concept(
        self, video_title: str, transcript: str, engine: str, api_keys: Dict[str, Any]
    ) -> Dict[str, Any]:
        system_prompt, user_prompt = self.build_prompts(video_title, transcript)
        gateway = LLMGateway(api_keys)
        raw_res = await gateway.generate_text(
            prompt=user_prompt,
            system_prompt=system_prompt,
            engine=engine,
            json_mode=True,
            max_tokens=1500,
        )
        return self.parse_concept_json(raw_res or "{}")
