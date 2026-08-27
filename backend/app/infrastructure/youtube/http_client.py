"""Единый пул постоянных HTTP/2 соединений с Keep-Alive для всех инжесторов.

Устраняет накладные расходы на TCP/TLS handshake (~200-300 мс) при параллельном
сборе сигналов: одно соединение переиспользуется между Reddit/HN/GitHub/Trends/DDG.
"""

import asyncio
from typing import Optional

import httpx


class DeepTrendHTTPPool:
    """Глобальный синглтон AsyncClient HTTP/2 с Keep-Alive пулом."""

    _client: Optional[httpx.AsyncClient] = None
    _lock: asyncio.Lock = asyncio.Lock()

    @classmethod
    async def get_client(cls) -> httpx.AsyncClient:
        if cls._client is not None and not cls._client.is_closed:
            return cls._client

        async with cls._lock:
            if cls._client is None or cls._client.is_closed:
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
            return cls._client

    @classmethod
    async def close(cls) -> None:
        async with cls._lock:
            if cls._client is not None and not cls._client.is_closed:
                await cls._client.aclose()
                cls._client = None
