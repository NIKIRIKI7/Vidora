import os
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Base Paths
    BASE_DIR: Path = BACKEND_DIR
    AI_MODELS_DIR: Path = BACKEND_DIR / "ai-models"
    DATA_STORAGE_DIR: Path = BACKEND_DIR / "data_storage"
    REMOTION_DIR: Path = BACKEND_DIR / "remotion-project"
    PROJECTS_DIR: Path = BACKEND_DIR / "projects"
    CACHE_DIR: Path = Path.home() / ".cache" / "vidora-models"

    # API Keys
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    ROUTERAI_API_KEY: str = ""
    AITUNNEL_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    PEXELS_API_KEY: str = ""
    YOUTUBE_API_KEY: str = ""

    # Hardware & Model Settings
    VIDORA_LLAMA_GPU_LAYERS: int = 0
    WHISPER_MODEL_DEFAULT: str = "small"
    WHISPER_CACHE_TTL_SEC: float = 60.0

    # Server Settings
    HOST: str = "127.0.0.1"
    PORT: int = 8355
    CORS_ORIGINS: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "app://.",
        "file://",
    ]

    @property
    def allowed_roots(self) -> List[Path]:
        return [
            self.BASE_DIR.resolve(),
            self.PROJECTS_DIR.resolve(),
            self.CACHE_DIR.resolve(),
            Path(os.environ.get("TEMP", "/tmp")).resolve(),
        ]


settings = Settings()

# Environment bootstrap
os.environ.setdefault("HF_HOME", str(settings.CACHE_DIR))
os.environ.setdefault("XDG_CACHE_HOME", str(settings.CACHE_DIR))
os.environ.setdefault("TORCH_HOME", str(settings.CACHE_DIR))
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")

# Автоматическое создание обязательных папок
settings.PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
settings.DATA_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
