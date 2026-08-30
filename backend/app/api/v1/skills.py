"""CRUD API для управления промптами/скилами в SQLite."""

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_skills_repository
from app.domain.skills.models import SkillCreate, SkillItem, SkillStage, SkillUpdate
from app.infrastructure.skills.repository import SqliteSkillsRepository

router = APIRouter()


@router.get("", response_model=list[SkillItem])
async def get_all_skills(
    stage: SkillStage | None = None,
    is_active: bool | None = None,
    repo: SqliteSkillsRepository = Depends(get_skills_repository),
):
    return await repo.list_all(stage=stage, is_active=is_active)


@router.get("/{skill_id}", response_model=SkillItem)
async def get_skill(
    skill_id: str,
    repo: SqliteSkillsRepository = Depends(get_skills_repository),
):
    skill = await repo.get_by_id(skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill prompt not found")
    return skill


@router.post("", response_model=SkillItem, status_code=status.HTTP_201_CREATED)
async def create_skill(
    payload: SkillCreate,
    repo: SqliteSkillsRepository = Depends(get_skills_repository),
):
    return await repo.create(payload)


@router.patch("/{skill_id}", response_model=SkillItem)
async def update_skill(
    skill_id: str,
    payload: SkillUpdate,
    repo: SqliteSkillsRepository = Depends(get_skills_repository),
):
    updated = await repo.update(skill_id, payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Skill prompt not found")
    return updated


@router.delete("/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(
    skill_id: str,
    repo: SqliteSkillsRepository = Depends(get_skills_repository),
):
    success = await repo.delete(skill_id)
    if not success:
        raise HTTPException(status_code=404, detail="Skill prompt not found")
