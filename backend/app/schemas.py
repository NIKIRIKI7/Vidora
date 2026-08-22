from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict

def _to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])

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
    routerai: Optional[str] = None
    aitunnel: Optional[str] = None

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
    design_prompt: Optional[str] = Field(None, description="Prompt for voice design")
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
    whisper_model: str = "small"

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

class MusicEqSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=_to_camel)
    enable_low_cut: bool = True
    low_cut_freq: int = Field(default=80, ge=40, le=200, validation_alias="lowCutFreqHz")
    enable_mid_carve: bool = True
    mid_carve_freq: int = Field(default=2500, ge=1000, le=4000, validation_alias="midCarveFreqHz")
    mid_carve_gain: float = Field(default=-3.5, ge=-12.0, le=0.0, validation_alias="midCarveGainDb")

class BackgroundMusicSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=_to_camel)
    enabled: bool = False
    track_id: Optional[str] = None
    track_name: Optional[str] = None
    custom_track_path: Optional[str] = None
    preset: str = "youtube_tech"
    base_volume: float = Field(default=0.35, ge=0.0, le=1.0)
    ducked_volume: float = Field(default=0.12, ge=0.0, le=0.5)
    threshold: float = Field(default=0.08, ge=0.01, le=0.5)
    attack_ms: int = Field(default=140, ge=10, le=1000)
    release_ms: int = Field(default=600, ge=100, le=3000)
    hold_ms: int = Field(default=250, ge=0, le=1000)
    fade_in_sec: float = Field(default=1.0, ge=0.0, le=5.0)
    fade_out_sec: float = Field(default=1.5, ge=0.0, le=10.0)
    loop: bool = True
    loop_crossfade_sec: float = Field(default=2.0, ge=0.0, le=6.0)
    eq: Optional[MusicEqSchema] = None

class RenderRequest(BaseModel):
    project_id: str
    target: str
    target_id: str
    project_path: str
    tsx_code: str = ""
    audio_path: Optional[str] = ""
    background_music: Optional[BackgroundMusicSchema] = None

class DuckingPreviewRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True, alias_generator=_to_camel)
    voice_path: str
    music_path: str
    project_path: str = "vidora_projects"
    preview_duration: float = Field(default=10.0, ge=3.0, le=30.0)
    base_volume: float = Field(default=0.35, ge=0.0, le=1.0)
    ducked_volume: float = Field(default=0.12, ge=0.0, le=0.5)
    threshold: float = Field(default=0.08, ge=0.01, le=0.5)
    attack_ms: int = Field(default=140, ge=10, le=1000)
    release_ms: int = Field(default=600, ge=100, le=3000)
    fade_in_sec: float = Field(default=0.2, ge=0.0, le=5.0)
    fade_out_sec: float = Field(default=0.2, ge=0.0, le=10.0)
    eq: Optional[MusicEqSchema] = None

class TranscribeRequest(BaseModel):
    audio_path: str
    whisper_model: str = "small"

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
    api_keys: dict = {}
    fragments: List[AutoBRollFragment]


