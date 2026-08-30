"""Движок дифференциального импульса виральности Momentum 2.0.

Учитывает нелинейное затухание времени (H+0.5)^1.18, веса комментариев x30 и коэффициент свежести.
"""

import math

from app.domain.schemas.youtube import MomentumMetrics


class MomentumEngine:
    """Дифференциальный движок виральности Momentum 2.0."""

    @classmethod
    def calculate_momentum(
        cls,
        views: int,
        hours_alive: float,
        likes: int = 0,
        comments: int = 0,
        ratio: float = 1.0,
        is_short: bool = False,
    ) -> MomentumMetrics:
        v = max(1, int(views))
        h = max(0.5, float(hours_alive))
        l = max(0, int(likes))
        c = max(0, int(comments))
        r = max(0.1, float(ratio))

        # 1. Нелинейное степенное затухание времени
        time_decay = math.pow(h + 0.5, 1.18)
        base_velocity = v / time_decay

        # 2. Множитель вовлечения: комментарии весят в 2.5 раза больше лайков
        raw_engagement = (l * 12.0 + c * 30.0) / float(v + 1)
        e_mult = 1.0 + min(4.0, raw_engagement)

        # 3. Нормализация размера канала
        ratio_boost = math.sqrt(r)

        # 4. Буст-коэффициент ранней фазы
        k_freshness = 1.0
        if h <= 12.0 and r >= 2.0:
            k_freshness = 2.5
        elif h <= 48.0 and r >= 1.5:
            k_freshness = 1.5

        # Итоговый M-Score без лишнего x10 (соответствует порогам M >= 500 / 180 / 60)
        m_score_raw = base_velocity * e_mult * ratio_boost * k_freshness
        m_score = int(round(m_score_raw))

        # Оценка ускорения трафика
        linear_vph = v / h
        accel_ratio = round((base_velocity / max(1.0, linear_vph)) * 100 * k_freshness)
        acceleration_str = f"+{accel_ratio}%" if accel_ratio > 0 else f"{accel_ratio}%"

        # Классификация фазы разгона (Velocity Stage)
        if (h <= 18.0 and m_score >= 500 and r >= 2.0) or (h <= 8.0 and m_score >= 250 and r >= 2.0):
            stage = "ROCKET_IGNITION"
            is_rocket = True
            acceleration_str = f"+{max(350, accel_ratio * 2)}% 🔥"
        elif (h <= 72.0 and m_score >= 180 and r >= 1.5) or (m_score >= 180 and r >= 1.5):
            stage = "VIRAL_SURGE"
            is_rocket = True
            acceleration_str = f"+{max(150, accel_ratio)}%"
        elif r >= 1.3 and linear_vph >= 150:
            stage = "STEADY_CLIMBER"
            is_rocket = False
        else:
            stage = "SATURATED_LEGACY"
            is_rocket = False

        return MomentumMetrics(
            m_score=m_score,
            velocity_stage=stage,
            acceleration_pct=acceleration_str,
            engagement_multiplier=round(e_mult, 2),
            is_rocket=is_rocket,
        )
