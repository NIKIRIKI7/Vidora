"""End-to-end self-check для SQLite-скилов: bootstrap, CRUD, prompt builder."""
import asyncio
import sys

sys.path.insert(0, ".")

from sqlalchemy import func, select

from app.core.database import AsyncSessionFactory, Base, engine
from app.domain.skills.models import SkillCreate, SkillStage, SkillUpdate
from app.domain.skills.prompt_builder import build_prompt_from_db_skills
from app.infrastructure.db.bootstrap import bootstrap_database
from app.infrastructure.db.models import SkillModel
from app.infrastructure.skills.repository import SqliteSkillsRepository


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionFactory() as session:
        async with session.begin():
            await bootstrap_database(session)

        repo = SqliteSkillsRepository(session)
        count = (await session.execute(select(func.count()).select_from(SkillModel))).scalar_one()
        assert count > 0, f"seed не загружен: {count}"
        print(f"[OK] skills в БД: {count}")

        created = await repo.create(
            SkillCreate(
                name="Test Skill", description="d", prompt="test prompt", stage=SkillStage.GENERAL, priority=5
            )
        )
        assert created.id.startswith("skill_")
        updated = await repo.update(
            created.id, SkillUpdate(prompt="updated prompt", is_active=False)
        )
        assert updated and updated.prompt == "updated prompt" and updated.is_active is False
        assert updated.version == 2, f"version не инкрементирован: {updated.version}"
        assert await repo.delete(created.id) is True
        assert await repo.get_by_id(created.id) is None
        print("[OK] CRUD create/update/delete + version bump")

        scene_skills = await repo.list_all(stage=SkillStage.SCENE_GENERATION, is_active=True)
        ctx = build_prompt_from_db_skills(scene_skills, stage=SkillStage.SCENE_GENERATION, max_char_budget=5000)
        assert "Tailwind" in ctx, "tailwind не попал в scene context"
        assert len(ctx) <= 5000 + 100, f"бюджет превышен: {len(ctx)}"
        print(f"[OK] prompt builder: scene ctx={len(ctx)} chars")

        await bootstrap_database(session)
        await session.commit()
        count2 = (await session.execute(select(func.count()).select_from(SkillModel))).scalar_one()
        assert count2 == count, f"bootstrap перезаписал БД: {count} -> {count2}"
        print(f"[OK] bootstrap идемпотентен (count стабилен: {count2})")

    await engine.dispose()
    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
