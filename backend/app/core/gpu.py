"""Межпроцессный и асинхронный менеджер захвата GPU и очистки VRAM."""

import os
import gc
import time
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

from app.core.config import settings


class GPUManager:
    """Управляет эксклюзивным доступом к видеокарте между всеми процессами сервера.

    Двухуровневый мьютекс: asyncio.Lock координирует корутины внутри процесса,
    атомарный lock-файл (O_CREAT|O_EXCL) блокирует доступ между процессами Uvicorn.
    """

    _async_lock = asyncio.Lock()
    _lock_file: Path = settings.DATA_STORAGE_DIR / "vidora_gpu.lock"

    @classmethod
    def clean_memory(cls) -> None:
        """Принудительная очистка VRAM и вызов сборщика мусора."""
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                torch.cuda.ipc_collect()
        except ImportError:
            pass
        gc.collect()

    @classmethod
    def _acquire_file_lock(cls) -> bool:
        """Попытка атомарного создания lock-файла (межпроцессная блокировка)."""
        try:
            fd = os.open(str(cls._lock_file), os.O_CREAT | os.O_EXCL | os.O_RDWR)
            with os.fdopen(fd, "w") as f:
                f.write(f"{os.getpid()}:{time.time()}")
            return True
        except FileExistsError:
            cls._cleanup_stale_lock()
            return False
        except Exception:
            return False

    @classmethod
    def _release_file_lock(cls) -> None:
        """Освобождение межпроцессного lock-файла."""
        try:
            if cls._lock_file.exists():
                cls._lock_file.unlink(missing_ok=True)
        except Exception:
            pass

    @classmethod
    def _cleanup_stale_lock(cls, max_age_sec: float = 300.0) -> None:
        """Удаляет lock-файл, если владеющий процесс умер или превышен таймаут."""
        try:
            if not cls._lock_file.exists():
                return
            content = cls._lock_file.read_text().strip()
            if ":" not in content:
                return
            pid_str, ts_str = content.split(":", 1)
            pid = int(pid_str)
            ts = float(ts_str)

            if time.time() - ts > max_age_sec:
                cls._release_file_lock()
                return

            if not cls._is_pid_alive(pid):
                cls._release_file_lock()
        except Exception:
            pass

    @staticmethod
    def _is_pid_alive(pid: int) -> bool:
        """Проверяет существование процесса в ОС."""
        if pid <= 0:
            return False
        if os.name == "nt":
            import ctypes
            kernel32 = ctypes.windll.kernel32
            handle = kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
            if handle:
                kernel32.CloseHandle(handle)
                return True
            return False
        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    @classmethod
    async def acquire_gpu(cls, timeout: float = 180.0) -> None:
        """Захватывает GPU: внутри процесса asyncio, между процессами — lock-файл."""
        await cls._async_lock.acquire()
        start_time = time.time()

        while True:
            if cls._acquire_file_lock():
                break
            if time.time() - start_time > timeout:
                cls._async_lock.release()
                raise TimeoutError(f"Превышено время ожидания захвата GPU ({timeout}s)")
            await asyncio.sleep(0.1)

        cls.clean_memory()

    @classmethod
    def release_gpu(cls) -> None:
        """Освобождает GPU замок для всех процессов и очищает память."""
        try:
            cls.clean_memory()
        finally:
            cls._release_file_lock()
            if cls._async_lock.locked():
                cls._async_lock.release()

    @classmethod
    @asynccontextmanager
    async def run_exclusive(cls, timeout: float = 180.0):
        """Асинхронный контекстный менеджер эксклюзивной работы с видеокартой."""
        await cls.acquire_gpu(timeout=timeout)
        try:
            yield
        finally:
            cls.release_gpu()
