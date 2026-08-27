"""DTO-схемы для работы с B-roll видео и Pexels стоками."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class AutoBRollFragment(BaseModel):
    id: str
    visual_note: str
    text: str
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    duration: Optional[float] = None


class AutoBRollRequest(BaseModel):
    project_path: str
    format: str = "16:9"
    engine: str = "anthropic/claude-sonnet-5"
    api_keys: Dict[str, Any] = Field(default_factory=dict)
    fragments: List[AutoBRollFragment] = Field(default_factory=list)


class ProcessBRollRequest(BaseModel):
    project_path: str
    source_path: str
    filename_prefix: Optional[str] = "broll"
    target_format: Literal["16:9", "9:16"] = "16:9"
    target_resolution: Literal["1080p", "1440p", "2160p"] = "1080p"
    fps: int = Field(default=30, ge=24, le=60)
    fit_mode: Literal["cover", "blur_pad"] = "cover"
    target_duration: Optional[float] = None
    loop_if_shorter: bool = False
    keep_audio: bool = False
    extract_audio: bool = False


class BatchAssignBRollItem(BaseModel):
    target_id: str
    source_path: str
    target_duration: Optional[float] = None


class BatchAssignBRollRequest(BaseModel):
    project_path: str
    target_format: Literal["16:9", "9:16"] = "16:9"
    target_resolution: Literal["1080p", "1440p", "2160p"] = "1080p"
    fps: int = 30
    fit_mode: Literal["cover", "blur_pad"] = "cover"
    items: List[BatchAssignBRollItem] = Field(default_factory=list)


class DownloadRequest(BaseModel):
    project_path: str
    url: str
    filename: str
    folder: str = "b-roll"
