"""Провайдеры зависимостей FastAPI (Inversion of Control & Dependency Injection)."""

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.ai.tts.factory import TTSProviderFactory
from app.infrastructure.skills.repository import SqliteSkillsRepository
from app.infrastructure.storage.code_history_repo import CodeHistoryRepository
from app.services.audio_service import AudioService
from app.services.code_gen_service import CodeGenService
from app.services.media_service import MediaService
from app.services.render_service import RenderService
from app.services.system_service import SystemService
from app.services.youtube_service import YouTubeService


# --- Базовые инфраструктурные провайдеры ---

def get_llm_gateway() -> LLMGateway:
    return LLMGateway()


def get_code_history_repo() -> CodeHistoryRepository:
    return CodeHistoryRepository()


def get_tts_factory() -> TTSProviderFactory:
    return TTSProviderFactory()


def get_skills_repository(
    session: AsyncSession = Depends(get_db),
) -> SqliteSkillsRepository:
    return SqliteSkillsRepository(session)


# --- Сервисные провайдеры домена ---

def get_code_gen_service(
        llm_gateway: LLMGateway = Depends(get_llm_gateway),
        history_repo: CodeHistoryRepository = Depends(get_code_history_repo),
        skills_repo: SqliteSkillsRepository = Depends(get_skills_repository),
) -> CodeGenService:
    return CodeGenService(llm_gateway=llm_gateway, history_repo=history_repo, skills_repo=skills_repo)


def get_audio_service(
        tts_factory: TTSProviderFactory = Depends(get_tts_factory),
) -> AudioService:
    return AudioService(tts_factory=tts_factory)


def get_media_service(
        llm_gateway: LLMGateway = Depends(get_llm_gateway),
) -> MediaService:
    return MediaService(llm_gateway=llm_gateway)


def get_render_service() -> RenderService:
    return RenderService()


def get_system_service(
        history_repo: CodeHistoryRepository = Depends(get_code_history_repo),
        skills_repo: SqliteSkillsRepository = Depends(get_skills_repository),
) -> SystemService:
    return SystemService(history_repo=history_repo, skills_repo=skills_repo)


def get_youtube_service(
        llm_gateway: LLMGateway = Depends(get_llm_gateway),
        skills_repo: SqliteSkillsRepository = Depends(get_skills_repository),
) -> YouTubeService:
    return YouTubeService(llm_gateway=llm_gateway, skills_repo=skills_repo)
