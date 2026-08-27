"""Скрипт запуска сборки backend.exe через spec-файл."""

import os
import sys
import subprocess
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

if __name__ == "__main__":
    dist_dir = ROOT_DIR / "dist"
    spec_file = ROOT_DIR / "scripts" / "backend.spec"

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--distpath",
        str(dist_dir),
        "--workpath",
        str(ROOT_DIR / "build"),
        "--clean",
        "--noconfirm",
        str(spec_file),
    ]

    subprocess.run(cmd, check=True)
    out_exe = dist_dir / ("backend.exe" if sys.platform == "win32" else "backend")
    print(f"OK: {out_exe}")
