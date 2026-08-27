"""Сборщик и синхронизатор ассетов проекта в public-директорию Remotion."""

import os
import re
import shutil
import sys
from pathlib import Path
from typing import Optional, List, Set

from app.core.config import settings


def find_file_smart(
        filename: str, proj_dir: Optional[Path] = None, extra_dirs: Optional[List[Path | str]] = None
) -> Optional[Path]:
    """Быстрый многоуровневый поиск файла в проекте и медиа-папках пользователя."""
    if not filename:
        return None
    p = Path(filename)
    if p.is_file() and p.exists():
        return p

    target_name = p.name.lower()
    if proj_dir and proj_dir.exists():
        try:
            for root, _, files in os.walk(str(proj_dir)):
                for f in files:
                    if f.lower() == target_name:
                        return Path(root) / f
        except Exception:
            pass

    remo_broll = settings.REMOTION_DIR / "public" / "assets" / "b-roll"
    if remo_broll.exists():
        cand = remo_broll / p.name
        if cand.is_file() and cand.exists():
            return cand

    search_roots = [
        settings.PROJECTS_DIR,
        Path.home() / "Videos",
        Path.home() / "Downloads",
        settings.BASE_DIR,
        Path.cwd(),
    ]
    if extra_dirs:
        for ed in extra_dirs:
            if ed:
                search_roots.append(Path(str(ed)) if not isinstance(ed, Path) else ed)

    for root in search_roots:
        if not root or not root.exists():
            continue
        try:
            for r, dirs, files in os.walk(str(root)):
                try:
                    rel_depth = len(Path(r).relative_to(root).parts)
                    if rel_depth > 4:
                        dirs.clear()
                        continue
                except Exception:
                    pass
                for f in files:
                    if f.lower() == target_name:
                        return Path(r) / f
        except Exception:
            continue
    return None


def prepare_remotion_public_assets(
        proj_assets: Path, extra_sources: Optional[List[str]] = None, tsx_code: str = ""
) -> None:
    """Копирует в public/assets только файлы, реально нужные текущей сцене (staticFile + b-roll)."""
    remo_public_dir = settings.REMOTION_DIR / "public"
    remo_public_assets = remo_public_dir / "assets"
    remo_public_broll = remo_public_assets / "b-roll"

    if remo_public_assets.is_symlink() or (sys.platform == "win32" and os.path.islink(str(remo_public_assets))):
        try:
            os.unlink(str(remo_public_assets))
        except Exception:
            shutil.rmtree(str(remo_public_assets), ignore_errors=True)

    remo_public_assets.mkdir(parents=True, exist_ok=True)
    remo_public_broll.mkdir(parents=True, exist_ok=True)

    proj_dir = proj_assets.parent if proj_assets else None
    needed_files: Set[str] = set()
    if tsx_code:
        matches = re.findall(r"staticFile\(\s*['\"]([^'\"]+)['\"]\s*\)", tsx_code)
        for m in matches:
            needed_files.add(Path(m.lstrip("/\\")).name)
    for src in extra_sources or []:
        if src:
            needed_files.add(Path(src).name)

    for fname in needed_files:
        found = find_file_smart(fname, proj_dir, extra_sources)
        if not found or not found.is_file():
            continue
        rel_hint = ""
        if tsx_code:
            for m in re.findall(r"staticFile\(\s*['\"]([^'\"]+)['\"]\s*\)", tsx_code):
                clean = m.lstrip("/\\").replace("/", os.sep)
                if Path(clean).name == fname:
                    rel_hint = str(Path(clean).parent)
                    break
        dst = (remo_public_assets / rel_hint / fname) if rel_hint and rel_hint != "." else (remo_public_broll / fname)
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists() or dst.stat().st_size != found.stat().st_size:
            try:
                shutil.copy2(str(found), str(dst))
                print(f"[RENDER] Ассет скопирован: {found} -> {dst}")
            except Exception as e:
                print(f"[RENDER] Ошибка копирования {found}: {e}")
