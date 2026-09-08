from typing import List, Optional

from pydantic import BaseModel


class EngineModelInfo(BaseModel):
    id: str
    name: str
    capabilities: List[str]


class ModelsResponse(BaseModel):
    engines: List[EngineModelInfo]


class SynthesizeRequest(BaseModel):
    engine_id: str
    text: str
    speaker_embedding_path: Optional[str] = None
    output_audio_path: str
    speed: float = 1.0
    pitch: float = 1.0


class CloneRequest(BaseModel):
    engine_id: str
    reference_audio_path: str
    output_embedding_path: str
    reference_text: Optional[str] = None


class SimpleResponse(BaseModel):
    status: str
    message: str = ""
