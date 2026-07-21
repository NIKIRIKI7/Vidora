"""Build backend into standalone exe for Electron."""
import os
import sys
import subprocess

subprocess.run([
    sys.executable, "-m", "PyInstaller",
    "--onefile",
    "--name", "backend",
    "--distpath", "dist",
    "--clean", "--noconfirm",
    "app/main.py"
], check=True)

print(f"OK: {os.path.join('dist', 'backend.exe')}")
