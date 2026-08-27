"""DTO-схемы для работы со звуком, TTS и синхронизацией."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.domain.schemas.common import ApiKeys


def _to_camel(s: str) -> str:
    parts = s.split("_")
    return parts[0] + "".join(p.capitalize() for p in parts[1:])


class AudioGenerationRequest(BaseModel):
    fragment_id: str
    text: str
    file_prefix: Optional[str] = "audio"
    voice_model: str = Field(..., description="aria, marcus, nova, clone, kseniya, etc.")
    guidance_scale: float = Field(default=3.0, ge=0.0, le=10.0)
    num_steps: int = Field(default=32, ge=8, le=64)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    duration: float = Field(default=0.0, ge=0.0, le=30.0)
    denoise: bool = True
    preprocess_prompt: bool = True
    postprocess_output: bool = True
    ref_audio_path: Optional[str] = None
    ref_text: Optional[str] = None
    design_prompt: Optional[str] = None
    project_path: str = Field(..., description="Путь к директории проекта")
    auto_offload_vram: bool = True
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


class SceneAudioMatchItem(BaseModel):
    scene_id: str
    filename: str
    relative_path: str
    absolute_path: str
    duration: float


class BatchSceneAudioResponse(BaseModel):
    status: str = "ok"
    matched_count: int
    matches: List[SceneAudioMatchItem] = Field(default_factory=list)
    unmatched_files: List[str] = Field(default_factory=list)


class BatchFragmentItem(BaseModel):
    id: str
    text: str


class BatchSceneVoiceItem(BaseModel):
    scene_id: str
    title: Optional[str] = ""
    text: Optional[str] = None
    fragments: List[BatchFragmentItem] = Field(default_factory=list)


class BatchAudioGenerationRequest(BaseModel):
    project_path: str = Field(..., description="Путь к проекту")
    scenes: List[BatchSceneVoiceItem] = Field(..., description="Сцены для пакетной озвучки")
    voice_model: str = Field(default="nova", description="Голос: aria, marcus, nova, clone, kseniya и т.д.")
    engine: Optional[str] = None
    file_prefix: Optional[str] = "scene"
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
    guidance_scale: float = 3.0
    num_steps: int = 32
    denoise: bool = True
    postprocess_output: bool = True
    ref_audio_path: Optional[str] = None
    ref_text: Optional[str] = None
    design_prompt: Optional[str] = None
    api_keys: Optional[ApiKeys] = None
    auto_align: bool = Field(default=True, description="Выровнять тайминги фрагментов через Whisper")
    whisper_model: str = "small"


class GeneratedSceneAudioResult(BaseModel):
    scene_id: str
    filename: str
    relative_path: str
    absolute_path: str
    duration: float
    status: str = "ok"
    error: Optional[str] = None
    fragments_timings: Optional[List[Dict[str, Any]]] = None


class BatchAudioGenerationResponse(BaseModel):
    status: str = "ok"
    total: int
    completed: int
    failed: int
    results: List[GeneratedSceneAudioResult] = Field(default_factory=list)
