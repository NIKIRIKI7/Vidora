from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SkillStage(str, Enum):
    SCENE_GENERATION = "scene_generation"
    PROJECT = "project"
    FRAGMENT = "fragment"
    TTS = "tts"
    SCRIPT_DRAFTING = "script_drafting"
    HOOK_ANALYSIS = "hook_analysis"
    GENERAL = "general"


class PullRequest(BaseModel):
    engine: str


class SkillItem(BaseModel):
    id: str = Field(..., description="Уникальный идентификатор скила")
    title: str = Field(..., description="Название скила")
    category: str = Field(default="general", description="Категория скила (motion, text, audio, styling)")
    stage: str = Field(
        default=SkillStage.SCENE_GENERATION.value,
        description="Этап пайплайна, на котором активируется скил",
    )
    processes: List[str] = Field(
        default_factory=lambda: ["scene", "project"],
        description="Список ID процессов пайплайна для совместимости",
    )
    priority: int = Field(default=4, ge=1, le=5, description="Приоритет (1–5)")
    enabled: bool = Field(default=True, description="Активен ли скил")
    is_custom: bool = Field(default=False, description="Флаг пользовательского редактирования")
    description: str = Field(..., description="Краткое описание назначения")
    content: str = Field(..., description="Полный текст системного промпта")


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
