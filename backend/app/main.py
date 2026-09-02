import asyncio
import sys
import time
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.api.error_handlers import register_exception_handlers
from app.api.v1.router import api_v1_router
from app.core.config import settings
from app.core.database import AsyncSessionFactory, Base, engine
from app.core.gpu import GPUManager
from app.core.logging import add_log
from app.core.process_supervisor import ProcessSupervisor
from app.core.ws import ws_manager
from app.infrastructure.ai.tts.factory import TTSProviderFactory
from app.infrastructure.db.bootstrap import bootstrap_database
from app.infrastructure.remotion.runner import RemotionRunner
from app.infrastructure.youtube.http_client import DeepTrendHTTPPool

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())


@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP: Job Object + добивание сирот прошлого аварийного инстанса
    ProcessSupervisor.reconcile_startup()
    add_log("INFO", "SYSTEM", f"Сервер Vidora запущен на http://{settings.HOST}:{settings.PORT}")
    try:
        # 1. Создание структуры таблиц по ORM-моделям
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        # 2. Идемпотентная синхронизация скилов со skills_seed.json (seed + дозаливка + санитизация)
        async with AsyncSessionFactory() as session:
            async with session.begin():
                await bootstrap_database(session)
    except Exception as e:
        add_log("WARN", "SYSTEM", f"Сбой авто-синхронизации: {e}")
    yield

    # --- SHUTDOWN
    add_log("INFO", "SYSTEM", "Остановка сервера: фоновые задачи, воркеры, очистка VRAM...")

    # 1. Отменяем активные рендеры Remotion (graceful -> tree-kill)
    for task_id in list(RemotionRunner._active_renders.keys()):
        RemotionRunner.cancel(task_id)

    # 2. Выгружаем все TTS/LLM-провайдеры (шлют shutdown-пакет воркерам)
    TTSProviderFactory.unload_all()

    # 3. Пристреливаем оставшиеся подпроцессы супервизором
    ProcessSupervisor.shutdown_all(timeout=3.0)

    # 4. Закрываем глобальный пул HTTP/2 клиентов (keep-alive соединения)
    await DeepTrendHTTPPool.close()

    # 5. Остаточная очистка VRAM основного процесса
    GPUManager.clean_memory()

    # 6. Закрываем пул соединений с БД
    await engine.dispose()
    add_log("INFO", "SYSTEM", "Все ресурсы и VRAM освобождены.")


app = FastAPI(title="Vidora API", version="0.2.0", lifespan=lifespan)

# Регистрация глобальных обработчиков доменных ошибок
register_exception_handlers(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Сквозное логирование всех HTTP-запросов в приложении
@app.middleware("http")
async def global_logging_middleware(request: Request, call_next):
    start_time = time.time()
    path = request.url.path

    # Не спамим логами проверки healthcheck
    if path == "/api/health":
        return await call_next(request)

    response = await call_next(request)
    duration_ms = int((time.time() - start_time) * 1000)

    # Записываем ошибки со статусом 4xx и 5xx
    if response.status_code >= 400:
        add_log(
            "WARN" if response.status_code < 500 else "ERROR",
            "HTTP",
            f"{request.method} {path} -> HTTP {response.status_code} ({duration_ms} ms)",
        )
    return response


app.include_router(api_v1_router)


@app.get("/api/health")
def health_check():
    return {"status": "ok", "version": "0.2.0"}


@app.websocket("/ws/events/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await ws_manager.connect(client_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(client_id, websocket)


if __name__ == "__main__":
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, log_level="info")
