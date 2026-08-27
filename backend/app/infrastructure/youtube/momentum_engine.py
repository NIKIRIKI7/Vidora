"""Движок динамической производной вирусности (Momentum Velocity Engine).

Статический VPH = views/hours искажает картину: старое видео с огромным VPH уже
остановилось, а свежее от микро-канала с колоссальным ускорением алгоритма — нет.
M-Score наказывает возраст нелинейно (h^1.3) и усиливает вовлечённость (E_mult).
"""

import math

from app.domain.schemas.youtube import MomentumMetrics


class MomentumEngine:
    """Расчёт нелинейного импульса и отлов роликов-ракет в первые часы публикации."""

    @classmethod
    def calculate_momentum(
        cls,
        views: int,
        hours_alive: float,
        likes: int = 0,
        comments: int = 0,
        ratio: float = 1.0,
    ) -> MomentumMetrics:
        v = max(1, int(views))
        h = max(0.2, float(hours_alive))
        l = max(0, int(likes))
        c = max(0, int(comments))
        r = max(0.1, float(ratio))

        # 1. Нелинейное затухание времени h^1.3 (штрафует старые ролики)
        time_decay = math.pow(h, 1.3)
        base_velocity = v / time_decay

        # 2. Мультипликатор вовлечённости (комментарии x24, лайки x12)
        raw_engagement = (l * 12.0 + c * 24.0) / float(v + 1)
        e_mult = 1.0 + min(4.0, raw_engagement)

        # 3. Множитель превышения базы подписчиков
        ratio_boost = math.pow(r, 0.5)

        # Итоговый M-Score
        m_score_raw = base_velocity * e_mult * ratio_boost
        m_score = int(round(m_score_raw * 10.0))

        # Оценка ускорения относительно линейного VPH
        linear_vph = v / h
        accel_ratio = round((base_velocity / max(1.0, linear_vph)) * 100)
        acceleration_str = f"+{accel_ratio}%" if accel_ratio > 0 else f"{accel_ratio}%"

        # Классификация стадии взлёта
        if h <= 18.0 and m_score >= 180 and r >= 2.0:
            stage = "ROCKET_IGNITION"
            is_rocket = True
            acceleration_str = f"+{max(250, accel_ratio * 3)}% 🔥"
        elif h <= 72.0 and m_score >= 80 and r >= 1.5:
            stage = "VIRAL_SURGE"
            is_rocket = True
            acceleration_str = f"+{max(120, accel_ratio * 2)}%"
        elif r >= 1.5 and linear_vph >= 250:
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
