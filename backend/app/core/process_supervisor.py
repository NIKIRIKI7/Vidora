"""Централизованный супервизор внешних подпроцессов и воркеров.

1. На Windows привязывает всех потомков к Job Object с JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE:
   если процесс Python умрёт аварийно (OOM, Ctrl+C в диспетчере, закрытие терминала),
   ядро ОС само прикроет всё дерево (node/chrome/ffmpeg/audiocpp/воркеры) без участия Python.
2. Реестр процессов с двухфазной остановкой: graceful IPC (shutdown_cmd) -> tree-kill.
3. Журнал (journal) для reconcile на старте: переживает аварийный краш и добивает сирот прошлого инстанса.
"""

import ctypes
import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Dict, Optional

from app.core.config import settings
from app.core.logging import add_log

_JOURNAL_FILE = settings.DATA_STORAGE_DIR / "process_supervisor_journal.json"
_KILL_ON_JOB_CLOSE = 0x2000
_JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
_ASSIGN_RIGHTS = 0x0101  # PROCESS_SET_QUOTA | PROCESS_TERMINATE


class _LARGE_INTEGER(ctypes.Structure):
    _fields_ = [("LowPart", ctypes.c_ulong), ("HighPart", ctypes.c_long)]


class _JOBOBJECT_BASIC_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", _LARGE_INTEGER),
        ("PerJobUserTimeLimit", _LARGE_INTEGER),
        ("LimitFlags", ctypes.c_ulong),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", ctypes.c_ulong),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", ctypes.c_ulong),
        ("SchedulingClass", ctypes.c_ulong),
    ]


class _IO_COUNTERS(ctypes.Structure):
    _fields_ = [(n, ctypes.c_ulonglong) for n in (
        "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
        "ReadTransferCount", "WriteTransferCount", "OtherTransferCount",
    )]


class _JOBOBJECT_EXTENDED_LIMIT_INFORMATION(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", _JOBOBJECT_BASIC_LIMIT_INFORMATION),
        ("IoInfo", _IO_COUNTERS),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryLimit", ctypes.c_size_t),
        ("PeakJobMemoryLimit", ctypes.c_size_t),
    ]


class ProcessSupervisor:
    _lock = threading.Lock()
    _registry: Dict[int, Dict] = {}
    _job_handle = None

    # ---------- Windows Job Object ----------

    @classmethod
    def init_job_object(cls) -> None:
        if sys.platform != "win32":
            return
        with cls._lock:
            if cls._job_handle is not None:
                return
            try:
                from ctypes import wintypes
                kernel32 = ctypes.windll.kernel32
                kernel32.CreateJobObjectW.restype = ctypes.c_void_p
                kernel32.CreateJobObjectW.argtypes = [wintypes.LPVOID, wintypes.LPCWSTR]
                kernel32.SetInformationJobObject.restype = wintypes.BOOL
                kernel32.SetInformationJobObject.argtypes = [
                    wintypes.HANDLE, ctypes.c_int, wintypes.LPVOID, wintypes.DWORD,
                ]
                kernel32.CloseHandle.restype = wintypes.BOOL
                kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
                kernel32.OpenProcess.restype = ctypes.c_void_p
                kernel32.AssignProcessToJobObject.restype = wintypes.BOOL

                job = kernel32.CreateJobObjectW(None, None)
                if not job:
                    add_log("WARN", "SUPERVISOR", "CreateJobObjectW вернул NULL")
                    return
                info = _JOBOBJECT_EXTENDED_LIMIT_INFORMATION()
                info.BasicLimitInformation.LimitFlags = _KILL_ON_JOB_CLOSE
                ok = kernel32.SetInformationJobObject(
                    job,
                    _JOB_OBJECT_EXTENDED_LIMIT_INFORMATION,
                    ctypes.byref(info),
                    ctypes.sizeof(info),
                )
                if not ok:
                    kernel32.CloseHandle(job)
                    add_log("WARN", "SUPERVISOR", f"SetInformationJobObject не удался (err {ctypes.GetLastError()})")
                    return
                cls._job_handle = job
                add_log("INFO", "SUPERVISOR", "Windows Job Object активен (KILL_ON_JOB_CLOSE)")
            except Exception as e:
                add_log("WARN", "SUPERVISOR", f"Не удалось создать Job Object: {e}")

    @classmethod
    def _assign_to_job(cls, proc: subprocess.Popen) -> None:
        if sys.platform != "win32" or not cls._job_handle:
            return
        try:
            kernel32 = ctypes.windll.kernel32
            handle = kernel32.OpenProcess(_ASSIGN_RIGHTS, False, proc.pid)
            if handle:
                kernel32.AssignProcessToJobObject(cls._job_handle, handle)
                kernel32.CloseHandle(handle)
        except Exception:
            pass

    # ---------- Реестр ----------

    @classmethod
    def register(cls, proc: subprocess.Popen, name: str, shutdown_cmd: Optional[str] = None) -> None:
        if not proc or proc.poll() is not None:
            return
        with cls._lock:
            cls._prune_locked()
            cls._registry[proc.pid] = {
                "proc": proc,
                "name": name,
                "shutdown_cmd": shutdown_cmd,
                "argv_tail": cls._argv_tail(proc),
                "started_at": time.time(),
            }
        cls._assign_to_job(proc)
        cls._persist()
        add_log("INFO", "SUPERVISOR", f"Процесс зарегистрирован: {name} (PID: {proc.pid})")

    @classmethod
    def unregister(cls, proc_or_pid) -> None:
        pid = proc_or_pid.pid if isinstance(proc_or_pid, subprocess.Popen) else proc_or_pid
        with cls._lock:
            removed = cls._registry.pop(pid, None)
        if removed:
            cls._persist()

    @staticmethod
    def _argv_tail(proc: subprocess.Popen) -> str:
        try:
            args = proc.args
            if isinstance(args, str):
                return args[-400:]
            return " ".join(str(a) for a in list(args)[-6:])[-400:]
        except Exception:
            return ""

    @classmethod
    def _prune_locked(cls) -> None:
        """Выкидывает из реестра уже завершившиеся процессы."""
        for pid in [p for p, it in cls._registry.items() if it["proc"].poll() is not None]:
            cls._registry.pop(pid, None)

    # ---------- Остановка ----------

    @classmethod
    def kill_process_tree(cls, pid: int, timeout: float = 3.0) -> None:
        try:
            import psutil
            parent = psutil.Process(pid)
            children = parent.children(recursive=True)
            for child in children:
                try:
                    child.terminate()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
            try:
                parent.terminate()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
            _, alive = psutil.wait_procs(children + [parent], timeout=timeout)
            for p in alive:
                try:
                    p.kill()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except Exception:
            if os.name == "nt":
                subprocess.run(
                    ["taskkill", "/F", "/T", "/PID", str(pid)],
                    capture_output=True, check=False,
                )
            else:
                try:
                    os.kill(pid, 9)
                except OSError:
                    pass

    @classmethod
    def stop_process(cls, proc: subprocess.Popen, shutdown_cmd: Optional[str] = None,
                     timeout: float = 3.0) -> None:
        if not proc or proc.poll() is not None:
            cls.unregister(proc)
            return
        pid = proc.pid

        # Фаза 1: Graceful IPC-выход
        if shutdown_cmd and proc.stdin and not proc.stdin.closed:
            try:
                proc.stdin.write(shutdown_cmd)
                proc.stdin.flush()
                proc.wait(timeout=timeout)
                cls.unregister(pid)
                return
            except Exception:
                pass

        # Фаза 2: принудительное уничтожение дерева
        cls.kill_process_tree(pid, timeout=timeout)
        cls.unregister(pid)

    @classmethod
    def shutdown_all(cls, timeout: float = 3.0) -> None:
        with cls._lock:
            items = list(cls._registry.values())
            cls._registry.clear()
        if not items:
            cls._persist()
            return

        add_log("INFO", "SUPERVISOR", f"Остановка {len(items)} фоновых процессов...")
        for item in items:
            proc: subprocess.Popen = item["proc"]
            name: str = item["name"]
            try:
                cls.stop_process(proc, shutdown_cmd=item["shutdown_cmd"], timeout=timeout)
                add_log("INFO", "SUPERVISOR", f"Процесс завершён: {name} (PID: {proc.pid})")
            except Exception as e:
                add_log("WARN", "SUPERVISOR", f"Ошибка остановки {name}: {e}")
        cls._persist()

    # ---------- Журнал и reconcile ----------

    @classmethod
    def _persist(cls) -> None:
        try:
            with cls._lock:
                data = [{
                    "pid": pid,
                    "name": it["name"],
                    "argv_tail": it.get("argv_tail", ""),
                } for pid, it in cls._registry.items()]
            settings.DATA_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
            tmp = _JOURNAL_FILE.with_suffix(".tmp")
            tmp.write_text(json.dumps(data), encoding="utf-8")
            tmp.replace(_JOURNAL_FILE)
        except Exception:
            pass

    @classmethod
    def reconcile_startup(cls) -> None:
        """Инициализирует Job Object и добивает сирот прошлого аварийного инстанса."""
        cls.init_job_object()
        try:
            if not _JOURNAL_FILE.exists():
                return
            entries = json.loads(_JOURNAL_FILE.read_text(encoding="utf-8"))
            if not entries:
                return
            import psutil
            for entry in entries:
                pid = int(entry.get("pid", 0))
                token = entry.get("argv_tail", "")
                if pid <= 0 or not token:
                    continue
                try:
                    p = psutil.Process(pid)
                    if not p.is_running():
                        continue
                    cmdline = " ".join(p.cmdline())
                    if token and all(t in cmdline for t in token.split() if len(t) > 3):
                        name = entry.get("name", str(pid))
                        add_log("WARN", "SUPERVISOR", f"Reconcile: убиваю сироту {name} (PID {pid})")
                        cls.kill_process_tree(pid, timeout=2.0)
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
            _JOURNAL_FILE.unlink(missing_ok=True)
        except Exception as e:
            add_log("WARN", "SUPERVISOR", f"Reconcile завершился с ошибкой: {e}")
