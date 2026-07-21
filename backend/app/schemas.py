from pydantic import BaseModel, Field
from typing import List, Optional

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
    transitions: List[str] = []
    colors: AppColors

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
    fragments: List[SceneFragment]
    remotionCode: Optional[str] = None

class ProjectData(BaseModel):
    name: str
    scenes: List[Scene]
    montage: MontageSettings

class AudioGenerationRequest(BaseModel):
    fragment_id: str
    text: str
    voice_model: str = Field(..., description="aria, marcus, nova, clone")
    stability: float = Field(default=0.75, ge=0.0, le=1.0)
    clarity: float = Field(default=0.90, ge=0.0, le=1.0)
    ref_audio_path: Optional[str] = Field(None, description="Absolute path to reference audio for cloning")
    ref_text: Optional[str] = Field(None, description="Text spoken in reference audio")
    project_path: str = Field(..., description="Absolute path to the project directory from Electron")

class CodeGenerationRequest(BaseModel):
    target_id: str = Field(..., description="Scene ID or Fragment ID")
    prompt: str
    project_data: ProjectData
    project_path: str = Field(..., description="Absolute path to the project directory from Electron")

class AudioProcessRequest(BaseModel):
    scene_id: str
    audio_path: str
    action: str
    project_path: str = ""

class SyncFragment(BaseModel):
    id: str
    text: str

class AudioSyncRequest(BaseModel):
    scene_id: str
    audio_path: str
    fragments: List[SyncFragment]
    project_path: str = ""

class AudioConcatRequest(BaseModel):
    audio_paths: List[str]
    output_path: str

class RenderRequest(BaseModel):
    project_id: str
    target: str
    target_id: str
    project_path: str
