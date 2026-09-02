"""Инициализатор БД: идемпотентная синхронизация skills_seed.json с таблицей скилов."""

import json
import logging
from pathlib import Path

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.skills.models import SkillStage
from app.infrastructure.db.models import SkillModel

logger = logging.getLogger("db.bootstrap")
SEED_PATH: Path = settings.BASE_DIR / "data" / "seeds" / "skills_seed.json"
VALID_STAGES = set(SkillStage._value2member_map_.keys())


def _valid_stage(stage: str) -> str:
    return stage if stage in VALID_STAGES else SkillStage.GENERAL.value


def _read_seed_data() -> list[dict]:
    if not SEED_PATH.exists():
        logger.warning("Файл seed %s не найден", SEED_PATH)
        return []
    try:
        with open(SEED_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.error("Ошибка чтения seed %s: %s", SEED_PATH, e)
        return []


def get_seed_skill(skill_id: str) -> dict | None:
    for item in _read_seed_data():
        if item.get("id") == skill_id:
            return item
    return None


async def bootstrap_database(session: AsyncSession) -> None:
    """
    Полная идемпотентная синхронизация БД со skills_seed.json:
    1. Защита: удаление устаревших builtin-скилов выполняется ТОЛЬКО при наличии валидного seed.
    2. Дозаливка: все отсутствующие в БД канонические скилы из seed добавляются.
    3. Санитизация: кастомные скилы (is_custom = 1) с невалидными стадиями нормализуются в 'general'.
    """
    raw_seed = _read_seed_data()
    seed_map = {item["id"]: item for item in raw_seed if "id" in item}
    seed_ids = set(seed_map.keys())

    # 1. Синхронизация системных скилов (только если seed прочитан)
    if seed_ids:
        # Удаляем мусорные builtin-скилы (которых нет в seed или чей stage устарел)
        cleanup_stmt = delete(SkillModel).where(
            SkillModel.is_custom == False,
            (SkillModel.id.not_in(seed_ids) | SkillModel.stage.not_in(VALID_STAGES)),
        )
        del_res = await session.execute(cleanup_stmt)
        if del_res.rowcount:
            logger.info("Удалено %d устаревших системных скилов из БД", del_res.rowcount)

        # Дозаливаем недостающие канонические скилы из seed
        existing_builtin_ids = set(
            (
                await session.execute(
                    select(SkillModel.id).where(SkillModel.is_custom == False)
                )
            )
            .scalars()
            .all()
        )
        missing_ids = seed_ids - existing_builtin_ids
        if missing_ids:
            added = 0
            for s_id in missing_ids:
                item = seed_map[s_id]
                skill = SkillModel(
                    id=item["id"],
                    name=item["name"],
                    description=item.get("description", ""),
                    prompt=item["prompt"],
                    stage=_valid_stage(item.get("stage", "general")),
                    priority=int(item.get("priority", 100)),
                    is_active=bool(item.get("is_active", True)),
                    is_custom=False,
                    version=1,
                )
                session.add(skill)
                added += 1
            logger.info("Добавлено %d недостающих канонических скилов из seed", added)

    # 2. Нормализация стадий кастомных скилов (сохраняет пользовательские данные)
    sanitize_stmt = (
        update(SkillModel)
        .where(SkillModel.is_custom == True, SkillModel.stage.not_in(VALID_STAGES))
        .values(stage=SkillStage.GENERAL.value)
    )
    san_res = await session.execute(sanitize_stmt)
    if san_res.rowcount:
        logger.info("Нормализован stage для %d кастомных скилов -> 'general'", san_res.rowcount)

    await session.flush()
