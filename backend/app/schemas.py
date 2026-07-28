from pydantic import BaseModel, Field
from typing import List, Optional, Dict

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
    typography: Optional[dict] = None

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

class ApiKeys(BaseModel):
    elevenlabs: Optional[str] = None
    anthropic: Optional[str] = None
    openai: Optional[str] = None

class AudioGenerationRequest(BaseModel):
    fragment_id: str
    text: str
    file_prefix: Optional[str] = "audio"
    voice_model: str = Field(..., description="aria, marcus, nova, clone")
    guidance_scale: float = Field(default=3.0, ge=0.0, le=10.0)
    num_steps: int = Field(default=32, ge=8, le=64)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    duration: float = Field(default=0.0, ge=0.0, le=30.0)
    denoise: bool = True
    preprocess_prompt: bool = True
    postprocess_output: bool = True
    ref_audio_path: Optional[str] = Field(None, description="Absolute path to reference audio for cloning")
    ref_text: Optional[str] = Field(None, description="Text spoken in reference audio")
    project_path: str = Field(..., description="Absolute path to the project directory from Electron")
    auto_offload_vram: bool = True
    engine: Optional[str] = None
    api_keys: Optional[ApiKeys] = None

class CodeGenerationRequest(BaseModel):
    target_id: str = Field(..., description="Scene ID or Fragment ID")
    prompt: str
    project_data: ProjectData
    project_path: str = Field(..., description="Absolute path to the project directory from Electron")
    engine: Optional[str] = None
    api_keys: Optional[ApiKeys] = None

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
    use_whisper: bool = True
    auto_offload_vram: bool = True

class AudioConcatRequest(BaseModel):
    audio_paths: List[str]
    output_path: str

class AdvancedSilenceRequest(BaseModel):
    scene_id: str
    audio_path: str
    project_path: str = ""
    threshold_db: float = -40.0
    min_silence_ms: int = 500
    max_silence_ms: int = 250
    remove_edges: bool = True

class RenderRequest(BaseModel):
    project_id: str
    target: str
    target_id: str
    project_path: str
    tsx_code: str = ""
    audio_path: Optional[str] = ""


