from typing import List, Optional

from pydantic import BaseModel, Field


class EngineModelInfo(BaseModel):
    id: str
    name: str
    capabilities: List[str]


class ModelsResponse(BaseModel):
    engines: List[EngineModelInfo]


class GenerationConfig(BaseModel):
    """Тонкие настройки диффузии (аналог Advanced Settings из Gradio)."""

    num_steps: int = Field(default=32, description="Inference steps")
    guidance_scale: float = Field(default=3.0, description="CFG scale")
    denoise: bool = Field(default=True, description="Prepend <|denoise|> token")
    duration: float = Field(default=0.0, description="Fixed duration in seconds (0 = auto)")
    preprocess_prompt: bool = Field(default=True, description="Preprocess prompt")
    postprocess_output: bool = Field(default=True, description="Postprocess audio output")


class SynthesizeRequest(BaseModel):
    engine_id: str
    text: str
    # Взаимоисключающие источники голоса:
    speaker_embedding_path: Optional[str] = None  # клон (Zero-Shot) — путь к .pt
    instruct: Optional[str] = None  # дизайн голоса — текстовое описание
    output_audio_path: str
    speed: float = 1.0
    pitch: float = 1.0
    # Эталонный голос (ref-audio + подпись текста) — для движков без .pt-вектора
    # и для обратной совместимости с профилями диктора, где нет embedding.
    reference_audio_path: Optional[str] = None
    reference_text: Optional[str] = None
    generation_config: GenerationConfig = Field(default_factory=GenerationConfig)


class CloneRequest(BaseModel):
    engine_id: str
    reference_audio_path: str
    output_embedding_path: str
    reference_text: Optional[str] = None


class SimpleResponse(BaseModel):
    status: str
    message: str = ""
