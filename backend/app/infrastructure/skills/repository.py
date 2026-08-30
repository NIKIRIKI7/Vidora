"""Чистый CRUD-репозиторий скилов на SQLAlchemy ORM. Без валидации промптов, без авто-сброса."""

import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.skills.models import SkillCreate, SkillItem, SkillStage, SkillUpdate
from app.infrastructure.db.models import SkillModel


class SqliteSkillsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, skill_id: str) -> SkillItem | None:
        model = await self.session.get(SkillModel, skill_id)
        return SkillItem.model_validate(model) if model else None

    async def list_all(
        self,
        stage: SkillStage | None = None,
        is_active: bool | None = None,
    ) -> list[SkillItem]:
        query = select(SkillModel)
        if stage is not None:
            query = query.where(
                or_(
                    SkillModel.stage == stage.value,
                    SkillModel.stage == SkillStage.GENERAL.value,
                )
            )
        if is_active is not None:
            query = query.where(SkillModel.is_active == is_active)
        query = query.order_by(SkillModel.priority.asc(), SkillModel.id.asc())

        result = await self.session.execute(query)
        return [SkillItem.model_validate(m) for m in result.scalars().all()]

    async def create(self, skill_in: SkillCreate, is_custom: bool = True) -> SkillItem:
        skill_id = f"skill_{uuid.uuid4().hex[:8]}"
        new_skill = SkillModel(
            id=skill_id,
            name=skill_in.name,
            description=skill_in.description,
            prompt=skill_in.prompt,
            stage=skill_in.stage.value,
            is_active=True,
            is_custom=is_custom,
            priority=skill_in.priority,
            version=1,
        )
        self.session.add(new_skill)
        await self.session.flush()
        await self.session.refresh(new_skill)
        return SkillItem.model_validate(new_skill)

    async def update(self, skill_id: str, skill_in: SkillUpdate) -> SkillItem | None:
        model = await self.session.get(SkillModel, skill_id)
        if not model:
            return None

        update_data = skill_in.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            if key == "stage" and isinstance(value, SkillStage):
                value = value.value
            setattr(model, key, value)

        model.version += 1
        await self.session.flush()
        await self.session.refresh(model)
        return SkillItem.model_validate(model)

    async def delete(self, skill_id: str) -> bool:
        model = await self.session.get(SkillModel, skill_id)
        if model:
            await self.session.delete(model)
            await self.session.flush()
            return True
        return False
