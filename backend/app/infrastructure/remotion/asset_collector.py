"""Изоляция ассетов задачи в namespaced public/jobs/{task_id}/ (копирование без hardlink'ов)."""

import os
import re
import shutil
from pathlib import Path
from typing import Optional, List

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


def _find_asset_source(
        filename: str, proj_dir: Optional[Path], extra_sources: Optional[List[str]] = None
) -> Optional[Path]:
    """Сначала точные пути из extra_sources, затем поиск по проекту/медиа/remotion-ассетам."""
    for src in extra_sources or []:
        if not src:
            continue
        cand = Path(src)
        if cand.is_file() and cand.name.lower() == filename.lower():
            return cand

    search_dirs: List[Path] = []
    for d in (settings.REMOTION_DIR / "src" / "assets", settings.REMOTION_DIR / "public" / "assets"):
        if d.exists():
            search_dirs.append(d)
    return find_file_smart(filename, proj_dir, extra_dirs=search_dirs)


def isolate_task_assets(
        task_id: str,
        tsx_code: str,
        proj_assets: Optional[Path],
        extra_sources: Optional[List[str]] = None,
) -> Path:
    """Копирует нужные задаче файлы (staticFile + b-roll) в public/jobs/{task_id}/.

    Пути в tsx_code уже должны быть namespaced: staticFile("jobs/{task_id}/...").
    Возвращает корень namespace'а public/jobs/{task_id}.
    """
    job_root = settings.REMOTION_DIR / "public" / "jobs" / task_id
    if job_root.exists():
        shutil.rmtree(job_root, ignore_errors=True)
    job_root.mkdir(parents=True, exist_ok=True)

    proj_dir = proj_assets.parent if proj_assets and proj_assets.exists() else None
    prefix = f"jobs/{task_id}/"

    # rel-пути (относительно namespace-корня) из staticFile-ссылок сцены
    rel_refs: List[str] = []
    seen: set = set()
    for m in re.findall(r"staticFile\(\s*['\"]([^'\"]+)['\"]\s*\)", tsx_code):
        clean = m.lstrip("/\\")
        if clean.startswith(prefix):
            rel = clean[len(prefix):]
        elif clean.startswith("jobs/"):
            rel = clean.split("/", 2)[2] if clean.count("/") >= 2 else clean
        else:
            continue
        rel = rel.replace("\\", "/")
        if ".." in Path(rel).parts or not rel or rel in seen:
            continue
        seen.add(rel)
        rel_refs.append(rel)

    # b-roll_sources без явной staticFile-ссылки кладём в assets/b-roll (как раньше)
    referenced = {Path(r).name for r in rel_refs}
    for src in extra_sources or []:
        if src and Path(src).name not in referenced:
            rel_refs.append(f"assets/b-roll/{Path(src).name}")

    copied = 0
    for rel in rel_refs:
        fname = Path(rel).name
        source = _find_asset_source(fname, proj_dir, extra_sources)
        if not source or not source.is_file():
            continue
        dest = job_root / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        try:
            if not dest.exists() or dest.stat().st_size != source.stat().st_size:
                shutil.copy2(str(source), str(dest))
            copied += 1
        except Exception as e:
            print(f"[RENDER] Ошибка копирования {source} -> {dest}: {e}")

    print(f"[RENDER] Изолировано ассетов для {task_id}: {copied} -> {job_root}")
    return job_root
