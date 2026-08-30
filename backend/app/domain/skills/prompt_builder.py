"""Чистая функция сборки контекста из скилов с лимитом бюджета. Без I/O, без сайд-эффектов."""

from typing import Sequence

from app.domain.skills.models import SkillItem, SkillStage


def build_prompt_from_db_skills(
    skills: Sequence[SkillItem],
    stage: SkillStage | None = None,
    specific_skill_id: str | None = None,
    max_char_budget: int = 14000,
) -> str:
    """Фильтрует, сортирует (priority ASC, id ASC) и склеивает скилы в контекст.

    Если specific_skill_id задан — включается только он. Иначе скилы стадии
    (плюс GENERAL) либо все, если stage не задан.
    """
    candidates = []
    for s in skills:
        if not s.is_active:
            continue
        if specific_skill_id and s.id == specific_skill_id:
            candidates.append(s)
            continue
        if stage:
            if s.stage == stage or s.stage == SkillStage.GENERAL:
                candidates.append(s)
        elif not specific_skill_id:
            candidates.append(s)

    sorted_skills = sorted(candidates, key=lambda x: (x.priority, x.id))

    parts: list[str] = []
    current_chars = 0
    for s in sorted_skills:
        block = f"# Skill: {s.name}\n{s.prompt.strip()}\n"
        if current_chars + len(block) > max_char_budget:
            break
        parts.append(block)
        current_chars += len(block)

    return "\n".join(parts).strip()
