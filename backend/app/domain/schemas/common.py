"""Общие DTO-схемы домена."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AppColors(BaseModel):
    primary: str
    secondary: str
    background: str
    surface: str
    accent: str
    text: str


class MontageSettings(BaseModel):
    fps: int
    animationStyle: str
    transitions: List[str] = Field(default_factory=list)
    colors: AppColors
    typography: Optional[Dict[str, Any]] = None


class SceneFragment(BaseModel):
    id: str
    visualNote: str
    text: str
    startTime: Optional[float] = None
    endTime: Optional[float] = None
    remotionCode: Optional[str] = None
    audioFileName: Optional[str] = None
    bRollFileName: Optional[str] = None


class Scene(BaseModel):
    id: str
    title: str
    timecode: str
    fragments: List[SceneFragment] = Field(default_factory=list)
    remotionCode: Optional[str] = None


class ProjectData(BaseModel):
    name: str
    scenes: List[Scene] = Field(default_factory=list)
    montage: MontageSettings


class ApiKeys(BaseModel):
    elevenlabs: Optional[str] = None
    anthropic: Optional[str] = None
    openai: Optional[str] = None
    routerai: Optional[str] = None
    aitunnel: Optional[str] = None
    pexels: Optional[str] = None
    youtube: Optional[str] = None
