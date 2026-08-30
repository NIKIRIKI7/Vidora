"""Инициализатор БД: создаёт таблицы, заливает seed и мигрирует кастомные скилы из старого JSON."""

import json
import logging

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.skills.models import SkillStage
from app.infrastructure.db.models import SkillModel

logger = logging.getLogger("db.bootstrap")
SEED_PATH = settings.BASE_DIR / "data" / "seeds" / "skills_seed.json"
LEGACY_REGISTRY_PATH = settings.DATA_STORAGE_DIR / "skills" / "skills_registry.json"

# Старые значения stage из skills_registry.json -> новые SkillStage
LEGACY_STAGE_MAP = {
    "code_generation": "scene_generation",
    "audio_directing": "tts",
    "widget_creation": "widget_creation",
    "scene_generation": "scene_generation",
    "script_drafting": "script_drafting",
    "hook_analysis": "hook_analysis",
    "tts": "tts",
    "tts_directing": "tts",
    "general": "general",
}


def _valid_stage(stage: str) -> str:
    return stage if stage in SkillStage._value2member_map_ else "general"


async def _load_seed_skills(session: AsyncSession) -> int:
    if not SEED_PATH.exists():
        logger.warning("Seed file %s not found. Starting with empty skills table.", SEED_PATH)
        return 0

    with open(SEED_PATH, encoding="utf-8") as f:
        raw_data = json.load(f)

    added = 0
    for item in raw_data:
        skill = SkillModel(
            id=item["id"],
            name=item["name"],
            description=item.get("description", ""),
            prompt=item["prompt"],
            stage=_valid_stage(item.get("stage", "general")),
            priority=int(item.get("priority", 100)),
            is_active=bool(item.get("is_active", True)),
            is_custom=bool(item.get("is_custom", False)),
            version=1,
        )
        session.add(skill)
        added += 1

    await session.flush()
    logger.info("Bootstrapped %d skills from %s", added, SEED_PATH)
    return added


async def _migrate_legacy_custom_skills(session: AsyncSession) -> int:
    """Переносит пользовательские (is_custom) скилы из старого JSON-реестра, если их нет в БД."""
    if not LEGACY_REGISTRY_PATH.exists():
        return 0

    existing_ids = set((await session.execute(select(SkillModel.id))).scalars().all())

    with open(LEGACY_REGISTRY_PATH, encoding="utf-8") as f:
        data = json.load(f)

    added = 0
    seed_ids = set(_read_seed_ids())
    for s in data.get("skills", []):
        s_id = s.get("id")
        if not s_id or s_id in existing_ids:
            continue
        # Мигрируем только кастомные скилы; builtin версии уже есть в seed полностью
        if not s.get("is_custom") and s_id in seed_ids:
            continue

        skill = SkillModel(
            id=s_id,
            name=s.get("title") or s.get("name") or s_id,
            description=s.get("description", ""),
            prompt=s.get("content") or s.get("prompt") or "",
            stage=_valid_stage(LEGACY_STAGE_MAP.get(s.get("stage", ""), "general")),
            priority=int(s.get("priority", 100)),
            is_active=bool(s.get("enabled", True)),
            is_custom=True,
            version=1,
        )
        session.add(skill)
        existing_ids.add(s_id)
        added += 1

    if added:
        await session.flush()
        logger.info("Migrated %d custom skills from legacy registry", added)
    return added


def _read_seed_ids() -> list[str]:
    if not SEED_PATH.exists():
        return []
    with open(SEED_PATH, encoding="utf-8") as f:
        return [item["id"] for item in json.load(f)]


def get_seed_skill(skill_id: str) -> dict | None:
    """Возвращает системную версию скила из seed (для reset)."""
    if not SEED_PATH.exists():
        return None
    with open(SEED_PATH, encoding="utf-8") as f:
        for item in json.load(f):
            if item["id"] == skill_id:
                return item
    return None


async def bootstrap_database(session: AsyncSession) -> None:
    """Вызывается один раз при старте: seed только если таблица пуста, затем миграция legacy."""
    count = (await session.execute(select(func.count()).select_from(SkillModel))).scalar_one()
    if count == 0:
        await _load_seed_skills(session)
    await _migrate_legacy_custom_skills(session)
