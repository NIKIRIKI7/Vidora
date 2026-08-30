"""Главный сборщик маршрутов API версии v1."""

from fastapi import APIRouter

from app.api.v1.audio import router as audio_router
from app.api.v1.code import router as code_router
from app.api.v1.media import router as media_router
from app.api.v1.render import router as render_router
from app.api.v1.skills import router as skills_router
from app.api.v1.system import router as system_router
from app.api.v1.youtube import router as youtube_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(audio_router)
api_v1_router.include_router(code_router)
api_v1_router.include_router(render_router)
api_v1_router.include_router(system_router)
api_v1_router.include_router(media_router)
api_v1_router.include_router(youtube_router)
api_v1_router.include_router(skills_router, prefix="/skills", tags=["Skills & Prompts"])
