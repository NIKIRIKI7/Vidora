# -*- mode: python ; coding: utf-8 -*-
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent


a = Analysis(
    [str(ROOT_DIR / "app" / "main.py")],
    pathex=[str(ROOT_DIR)],
    binaries=[],
    datas=[
        (str(ROOT_DIR / "app" / "infrastructure" / "workers"), "app/infrastructure/workers"),
    ],
    hiddenimports=[
        "uvicorn",
        "fastapi",
        "pydantic",
        "pydantic_settings",
        "torch",
        "torchaudio",
        "soundfile",
        "whisperx",
        "psutil",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "matplotlib"],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
