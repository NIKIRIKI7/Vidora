"""Схемы системного API.

Единый источник истины по скилам — доменные модели app.domain.skills.models.
Здесь SkillItem/SkillStage только реэкспортируются (Single Source of Truth), без дублирования.
"""

from typing import List, Optional

from pydantic import BaseModel, Field

from app.domain.skills.models import SkillItem, SkillStage  # noqa: F401


class PullRequest(BaseModel):
    engine: str


class SkillListResponse(BaseModel):
    status: str = "ok"
    skills: List[SkillItem]


class SkillCreateRequest(BaseModel):
    id: Optional[str] = None
    title: str
    category: str = "general"
    stage: str = SkillStage.SCENE_GENERATION.value
    processes: List[str] = Field(default_factory=lambda: ["scene"])
    priority: int = 4
    enabled: bool = True
    description: str = ""
    content: str = ""


class SkillUpdateRequest(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    stage: Optional[str] = None
    processes: Optional[List[str]] = None
    priority: Optional[int] = None
    enabled: Optional[bool] = None
    description: Optional[str] = None
    content: Optional[str] = None
