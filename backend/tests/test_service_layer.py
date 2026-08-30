"""Самопроверка сервисного слоя и DI-контейнера."""

import asyncio

from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient

from app.api import dependencies
from app.services.audio_service import AudioService
from app.services.code_gen_service import CodeGenService
from app.services.media_service import MediaService
from app.services.render_service import RenderService
from app.services.system_service import SystemService
from app.services.youtube_service import YouTubeService
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.ai.tts.factory import TTSProviderFactory
from app.infrastructure.storage.code_history_repo import CodeHistoryRepository


def test_di_container_wires_services():
    _app = FastAPI()

    @_app.get("/di")
    def check_di(
        code_gen: CodeGenService = Depends(dependencies.get_code_gen_service),
        audio: AudioService = Depends(dependencies.get_audio_service),
        media: MediaService = Depends(dependencies.get_media_service),
        render: RenderService = Depends(dependencies.get_render_service),
        system: SystemService = Depends(dependencies.get_system_service),
        youtube: YouTubeService = Depends(dependencies.get_youtube_service),
    ):
        assert isinstance(code_gen.llm_gateway, LLMGateway)
        assert isinstance(code_gen.history_repo, CodeHistoryRepository)
        assert isinstance(audio.tts_factory, type(TTSProviderFactory()))
        return {"ok": [type(s).__name__ for s in (code_gen, audio, media, render, system, youtube)]}

    with TestClient(_app) as c:
        body = c.get("/di").json()
        assert body["ok"] == [
            "CodeGenService", "AudioService", "MediaService", "RenderService",
            "SystemService", "YouTubeService",
        ]


def test_codegen_build_prompt():
    svc = CodeGenService()
    system, user = asyncio.run(svc.build_prompt("s1", "сделай титул", {"name": "P"}))
    assert "Remotion" in system and "```tsx" in system
    assert "s1" in user and "сделай титул" in user


def test_services_use_infra_modules():
    render_svc = RenderService()
    assert render_svc.runner.__class__.__module__ == "app.infrastructure.remotion.runner"

    media = MediaService()
    cats, customs = media.scan_music_library("")
    assert isinstance(cats, list) and isinstance(customs, list)

    sys_info = SystemService().get_hardware_info()
    assert {"vram_gb", "ram_gb", "device", "gpu_type"} <= set(sys_info)


def test_old_module_compat_surface():
    from app.infrastructure.media.ducking import mix_voice_and_music_ducking  # async-адаптер
    assert callable(mix_voice_and_music_ducking)

    import importlib
    for dead in (
        "app.modules.audio.service",
        "app.modules.code_gen.service",
        "app.modules.render.service",
        "app.modules.youtube.service",
    ):
        try:
            importlib.import_module(dead)
        except ImportError:
            continue
        raise AssertionError(f"Старый сервис {dead} должен быть удалён")


if __name__ == "__main__":
    test_di_container_wires_services()
    test_codegen_build_prompt()
    test_services_use_infra_modules()
    test_old_module_compat_surface()
    print("service layer OK")
