import asyncio
import gc
from typing import Optional

class GPUManager:
    _lock = asyncio.Lock()

    @classmethod
    def _clean_memory(cls):
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
        except ImportError:
            pass
        gc.collect()

    @classmethod
    async def acquire_gpu(cls):
        await cls._lock.acquire()
        cls._clean_memory()

    @classmethod
    def release_gpu(cls):
        cls._clean_memory()
        if cls._lock.locked():
            cls._lock.release()

    @classmethod
    def run_exclusive(cls):
        """Асинхронный контекстный менеджер для монопольного доступа к GPU."""
        class _GPUContext:
            async def __aenter__(self):
                await GPUManager.acquire_gpu()
                return self

            async def __aexit__(self, exc_type, exc_val, exc_tb):
                GPUManager.release_gpu()

        return _GPUContext()
