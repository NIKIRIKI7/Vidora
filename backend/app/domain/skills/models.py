"""Чистые Pydantic-модели и единая таксономия скилов."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class SkillStage(str, Enum):
    SCENE_GENERATION = "scene_generation"
    PROJECT = "project"
    FRAGMENT = "fragment"
    TTS = "tts"
    SCRIPT_DRAFTING = "script_drafting"
    HOOK_ANALYSIS = "hook_analysis"
    GENERAL = "general"


class SkillItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str = ""
    prompt: str
    stage: SkillStage
    is_active: bool = True
    is_custom: bool = False
    priority: int = 100
    version: int = 1
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class SkillCreate(BaseModel):
    name: str
    description: str = ""
    prompt: str
    stage: SkillStage
    priority: int = 100


class SkillUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    prompt: str | None = None
    stage: SkillStage | None = None
    is_active: bool | None = None
    priority: int | None = None
