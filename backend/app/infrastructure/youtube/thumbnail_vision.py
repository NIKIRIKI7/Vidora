"""Мультимодальный анализ превью: OCR в памяти + когнитивный диссонанс «Заголовок vs Обложка».

Высокий CTR создается расхождением заголовка и текста на обложке (Curiosity Gap).
OCR выполняется на CPU и не занимает VRAM, выделенную под LLM/TTS.
"""

import io
import re
from typing import Optional

from app.domain.schemas.youtube import ThumbnailVisionResult
from app.infrastructure.youtube.http_client import DeepTrendHTTPPool


class ThumbnailVisionEngine:
    """Мультимодальный экстрактор текста с превью и оценка когнитивного разрыва."""

    NEGATIVE_TRIGGER_WORDS = (
        "don't", "dont", "stop", "never", "avoid", "wrong", "trap", "danger", "worst",
        "fail", "bad", "не", "забудь", "шок", "ошибка", "хватит", "никогда", "опасно"
    )

    @classmethod
    async def analyze_thumbnail(
        cls, thumbnail_url: str, video_title: str
    ) -> ThumbnailVisionResult:
        if not thumbnail_url or not thumbnail_url.startswith("http"):
            return ThumbnailVisionResult()

        client = await DeepTrendHTTPPool.get_client()
        image_bytes: Optional[bytes] = None

        try:
            res = await client.get(thumbnail_url, timeout=3.5)
            if res.status_code == 200 and len(res.content) > 1000:
                image_bytes = res.content
        except Exception:
            pass

        if not image_bytes:
            return ThumbnailVisionResult()

        extracted_text = cls._extract_text_ocr(image_bytes)
        if not extracted_text:
            return ThumbnailVisionResult(
                overlay_text="",
                has_overlay=False,
                curiosity_gap_type="visual_only",
                visual_tension_summary="Обложка построена на чистом визуале без текста",
            )

        gap_type, summary = cls._evaluate_curiosity_gap(video_title, extracted_text)

        return ThumbnailVisionResult(
            overlay_text=extracted_text,
            has_overlay=True,
            curiosity_gap_type=gap_type,
            visual_tension_summary=summary,
        )

    @staticmethod
    def _extract_text_ocr(image_bytes: bytes) -> str:
        """Легковесный OCR инференс на CPU (pytesseract), fallback на пустую строку."""
        try:
            from PIL import Image
            import pytesseract

            img = Image.open(io.BytesIO(image_bytes)).convert("L")
            img = img.point(lambda p: 255 if p > 128 else 0)
            raw = pytesseract.image_to_string(img, config="--psm 6")
            clean = re.sub(r"[^\w\s\u0400-\u04FF!?#]", " ", raw).strip()
            words = [w for w in clean.split() if len(w) >= 2]
            return " ".join(words[:6])
        except Exception:
            return ""

    @classmethod
    def _evaluate_curiosity_gap(cls, title: str, overlay: str) -> tuple[str, str]:
        overlay_clean = overlay.lower().strip()
        t_words = set(re.findall(r"\w+", title.lower()))
        o_words = set(re.findall(r"\w+", overlay_clean))

        # 1. Сначала проверяем явные триггеры предостережений / запретов
        if any(
            re.search(r"\b" + re.escape(w) + r"\b", overlay_clean) or w in overlay_clean
            for w in cls.NEGATIVE_TRIGGER_WORDS
        ):
            return (
                "negative_warning",
                f"Обложка содержит предостережение/запрет: '{overlay}'",
            )

        # 2. Когнитивный диссонанс (нулевое пересечение слов с заголовком)
        overlap = len(t_words & o_words)
        if overlap == 0 and len(o_words) > 0:
            return (
                "high_contrast_contradiction",
                f"Текст обложки '{overlay}' создает интригу, не дублируя заголовок",
            )

        # 3. Прямое усиление темы заголовка
        return (
            "direct_reinforcement",
            f"Обложка усиливает тему заголовка: '{overlay}'",
        )
