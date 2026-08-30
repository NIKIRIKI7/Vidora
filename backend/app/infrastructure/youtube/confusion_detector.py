"""Детектор трения аудитории (Confusion Index) и псевдо-красных океанов.

Ниша может выглядеть занятой (миллионы просмотров), но если зрители не понимают
топовые гайды — это PSEUDO_RED_DISRUPTIVE: свободный вход с понятным решением.
"""

import re
from typing import Any, Dict, List

from app.domain.schemas.youtube import ConfusionMetrics


class ConfusionDetector:
    """Анализатор комментариев: вопросы, фрустрации и споры -> Confusion Index."""

    QUESTION_PATTERNS = [
        r"\b(как|почему|зачем|где|куда|откуда|сколько|какой|какая|что если)\b",
        r"\b(how\s+to|how\s+do|why\s+does|where\s+can|where\s+is|what\s+if|is\s+it\s+possible)\b",
        r"\?",
    ]

    FRUSTRATION_PATTERNS = [
        r"\b(не\s+работает|ошибка|выдает\s+ошибку|забыл|упустил|не\s+сказал|устарело|обман|не\s+помогло)\b",
        r"\b(doesn'?t\s+work|not\s+working|error|bug|failed|missing|skipped|outdated|misleading|waste\s+of\s+time)\b",
        r"\b(error\s+\d+|exception|crash)\b",
    ]

    DEBATE_PATTERNS = [
        r"\b(лучше\s+бы|надо\s+было|наоборот|не\s+согласен|вранье|ерунда|альтернатива)\b",
        r"\b(better\s+to|should\s+have|disagree|wrong|fake|nonsense|actually|instead\s+of)\b",
    ]

    @classmethod
    def analyze_comments_friction(
        cls,
        comments: List[Dict[str, Any]],
        video_views: int = 0,
        ratio: float = 1.0,
    ) -> ConfusionMetrics:
        if not comments:
            return ConfusionMetrics(
                confusion_index=0.0,
                status="RED_OCEAN_SATISFIED",
                actionable_fix="Недостаточно комментариев для анализа",
            )

        valid_comments = [
            c for c in comments
            if (c.get("text") and len(str(c.get("text", "")).strip()) >= 10)
        ]
        total_valid = len(valid_comments)
        if total_valid == 0:
            return ConfusionMetrics(
                confusion_index=0.0,
                status="RED_OCEAN_SATISFIED",
                actionable_fix="Комментарии отсутствуют",
            )

        questions = 0
        frustrations = 0
        debates = 0

        for c in valid_comments:
            text = str(c["text"]).lower()
            if any(re.search(p, text) for p in cls.QUESTION_PATTERNS):
                questions += 1
            if any(re.search(p, text) for p in cls.FRUSTRATION_PATTERNS):
                frustrations += 1
            if any(re.search(p, text) for p in cls.DEBATE_PATTERNS):
                debates += 1

        # Кворум доверия N/10 строго по спецификации §3.3
        confidence_multiplier = min(1.0, total_valid / 10.0)

        # Формула Confusion Index
        weighted_score = (questions * 1.4 + frustrations * 2.0 + debates * 1.0) / float(total_valid)
        raw_index = min(1.0, weighted_score / 2.2)
        final_index = round(raw_index * confidence_multiplier, 2)

        # Классификация
        if final_index >= 0.40 and (video_views >= 20000 or ratio >= 2.0):
            status = "PSEUDO_RED_DISRUPTIVE"
            fix = "Снять ролик-исправление: детальный пошаговый разбор без упущений лидеров"
        elif final_index >= 0.25:
            status = "MODERATE_QUALITY_GAP"
            fix = "Усилить практическую часть и разобрать частые ошибки зрителей"
        else:
            status = "RED_OCEAN_SATISFIED"
            fix = "Тема качественно закрыта существующими роликами"

        return ConfusionMetrics(
            confusion_index=final_index,
            status=status,
            questions_count=questions,
            frustrations_count=frustrations,
            debates_count=debates,
            actionable_fix=fix,
        )
