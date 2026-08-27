"""DTO-схемы пайплайна видеорендеринга."""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from app.domain.schemas.audio import BackgroundMusicSchema


class RenderRequest(BaseModel):
    project_id: str
    target: str
    target_id: str
    project_path: str
    tsx_code: str = ""
    audio_path: Optional[str] = ""
    broll_sources: List[str] = Field(default_factory=list)
    background_music: Optional[BackgroundMusicSchema] = None
    render_quality: Optional[Literal["low", "medium", "high"]] = "medium"


class VideoConcatRequest(BaseModel):
    project_path: str
    video_paths: List[str]
    output_path: str


class ExportRequest(BaseModel):
    project_name: str
    markdown: str
