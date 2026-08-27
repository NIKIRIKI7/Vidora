"""DTO-схемы генерации и ревизий TSX-компонентов."""

from typing import Optional

from pydantic import BaseModel, Field

from app.domain.schemas.common import ApiKeys, ProjectData


class CodeGenerationRequest(BaseModel):
    target_id: str = Field(..., description="ID сцены или фрагмента")
    prompt: str
    project_data: ProjectData
    project_path: str = Field(..., description="Абсолютный путь к директории проекта")
    engine: Optional[str] = None
    api_keys: Optional[ApiKeys] = None


class CodeGenerationResponse(BaseModel):
    status: str = "ok"
    tsx_code: str


class SaveRevisionRequest(BaseModel):
    project_id: str = ""
    scene_id: str = ""
    tsx_code: str = ""
    prompt: str = ""
