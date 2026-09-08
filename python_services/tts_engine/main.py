import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException

from adapters import REGISTRY
from core.schemas import (
    CloneRequest,
    EngineModelInfo,
    ModelsResponse,
    SimpleResponse,
    SynthesizeRequest,
)
from core.vram_manager import vram_manager

logger = logging.getLogger("tts_engine.api")

app = FastAPI(title="Vidora Local TTS Worker", version="1.0")

# Тяжёлые вызовы моделей уходят в отдельный поток (max_workers=1), чтобы не
# блокировать event loop FastAPI во время синтеза на GPU. VRAM-менеджер и так
# держит в памяти один движок, поэтому сериализация запросов здесь оправдана.
_worker_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="tts-worker")


def _resolve_engine_or_404(engine_id: str):
    """Возвращает движок из реестра (с ленивой загрузкой в VRAM) или 404."""
    try:
        return vram_manager.get_engine(engine_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


async def _run_in_worker(fn, *args):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_worker_pool, fn, *args)


@app.get("/api/v1/models", response_model=ModelsResponse)
async def get_models():
    """Динамический дискавери доступных движков для C# бэкенда."""
    engines = [
        EngineModelInfo(
            id=adapter_class.engine_id,
            name=adapter_class.name,
            capabilities=list(adapter_class.capabilities),
        )
        for adapter_class in REGISTRY.values()
    ]
    return ModelsResponse(engines=engines)


@app.post("/api/v1/synthesize", response_model=SimpleResponse)
async def synthesize(req: SynthesizeRequest):
    """Генерация аудио. Результат пишется на диск по абсолютному пути из запроса."""
    engine = _resolve_engine_or_404(req.engine_id)
    if "synthesis" not in engine.capabilities:
        raise HTTPException(
            status_code=400,
            detail=f"Движок '{req.engine_id}' не поддерживает синтез речи.",
        )

    try:
        await _run_in_worker(
            engine.synthesize,
            req.text,
            req.speaker_embedding_path,
            req.output_audio_path,
            req.speed,
            req.pitch,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("[Synthesize] Ошибка движка '%s'.", req.engine_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return SimpleResponse(status="success", message="Audio generated")


@app.post("/api/v1/clone", response_model=SimpleResponse)
async def clone(req: CloneRequest):
    """Клонирование: извлечение вектора голоса и запись его (.pt) на диск."""
    engine = _resolve_engine_or_404(req.engine_id)
    if "clone" not in engine.capabilities:
        raise HTTPException(
            status_code=400,
            detail=f"Движок '{req.engine_id}' не поддерживает клонирование голоса.",
        )

    try:
        await _run_in_worker(
            engine.clone_voice,
            req.reference_audio_path,
            req.output_embedding_path,
            req.reference_text,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("[Clone] Ошибка движка '%s'.", req.engine_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return SimpleResponse(status="success", message="Voice cloned successfully")


@app.post("/api/v1/vram/unload", response_model=SimpleResponse)
async def unload_vram():
    """Принудительная очистка видеопамяти по требованию C#."""
    await _run_in_worker(vram_manager.unload_all)
    return SimpleResponse(status="success", message="VRAM unloaded and cache cleared")


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    logging.basicConfig(level=logging.INFO)
    # Запуск сервера (для продакшена: uvicorn main:app --host 127.0.0.1 --port 8000)
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
