"""Единый пул постоянных HTTP/2 соединений с Keep-Alive для всех инжесторов.

Устраняет накладные расходы на TCP/TLS handshake (~200-300 мс) при параллельном
сборе сигналов: одно соединение переиспользуется между Reddit/HN/GitHub/Trends/DDG.

Никакие asyncio-примитивы не создаются на этапе import: лок лениво привязывается
к активному event loop и пересоздаётся при смене цикла (pytest / рестарт воркера).
Чтение уже созданного клиента — Zero-Lock fast path за O(1) без ожидания мьютекса.
"""

import asyncio
import threading
from typing import Optional

import httpx


class DeepTrendHTTPPool:
    """Глобальный синглтон AsyncClient HTTP/2 с Keep-Alive пулом (loop-aware)."""

    _client: Optional[httpx.AsyncClient] = None
    _lock: Optional[asyncio.Lock] = None
    _loop: Optional[asyncio.AbstractEventLoop] = None
    _thread_lock = threading.Lock()

    @classmethod
    def _get_lock(cls, current_loop: asyncio.AbstractEventLoop) -> asyncio.Lock:
        with cls._thread_lock:
            if cls._lock is None or cls._loop is not current_loop:
                cls._lock = asyncio.Lock()
                cls._loop = current_loop
            return cls._lock

    @classmethod
    async def get_client(cls) -> httpx.AsyncClient:
        current_loop = asyncio.get_running_loop()

        # 1. Zero-Lock Fast Path: клиент уже создан в текущем цикле и открыт
        if (
            cls._client is not None
            and not cls._client.is_closed
            and cls._loop is current_loop
        ):
            return cls._client

        # 2. Slow Path: инициализация под локом текущего цикла
        lock = cls._get_lock(current_loop)
        async with lock:
            if (
                cls._client is not None
                and not cls._client.is_closed
                and cls._loop is current_loop
            ):
                return cls._client

            # Клиент принадлежал другому (уже закрытому) циклу — закрываем старый
            if cls._client is not None and not cls._client.is_closed:
                try:
                    await cls._client.aclose()
                except Exception:
                    pass
                cls._client = None

            limits = httpx.Limits(
                max_keepalive_connections=50,
                max_connections=100,
                keepalive_expiry=30.0,
            )
            timeout = httpx.Timeout(3.5, connect=1.5)
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/124.0.0.0 Safari/537.36 VidoraSubSecond/2.0"
                ),
                "Accept-Encoding": "gzip, deflate, br",
            }
            cls._client = httpx.AsyncClient(
                http2=True,
                limits=limits,
                timeout=timeout,
                headers=headers,
                follow_redirects=True,
            )
            cls._loop = current_loop
            return cls._client

    @classmethod
    async def close(cls) -> None:
        """Штатное закрытие глобального пула соединений (вызывается в lifespan shutdown)."""
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if current_loop is None:
            if cls._client is not None and not cls._client.is_closed:
                try:
                    await cls._client.aclose()
                except Exception:
                    pass
            cls._client = None
            cls._loop = None
            return

        lock = cls._get_lock(current_loop)
        async with lock:
            if cls._client is not None and not cls._client.is_closed:
                try:
                    await cls._client.aclose()
                except Exception:
                    pass
            cls._client = None
            cls._loop = None
