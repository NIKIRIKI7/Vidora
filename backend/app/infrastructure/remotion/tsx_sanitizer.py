import os
import re
from pathlib import Path

from app.core.config import settings


def sanitize_tsx_for_missing_assets(tsx_code: str) -> str:
    """Защита от 404: заменяет ссылки на физически отсутствующие файлы безопасной заглушкой."""
    if not tsx_code:
        return tsx_code

    remo_public_dir = settings.REMOTION_DIR / "public"

    def replace_missing(match):
        full_tag = match.group(0)
        asset_path = match.group(1)
        clean_rel = asset_path.lstrip("/\\").replace("/", os.sep)
        dest_path = remo_public_dir / clean_rel
        alt_dest_path = remo_public_dir / "assets" / "b-roll" / Path(clean_rel).name
        if not dest_path.exists() and not alt_dest_path.exists():
            print(f"[RENDER WARN] Файл '{asset_path}' не найден. Применяем безопасный fallback.")
            filename = Path(clean_rel).name
            return f'<div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-8 border border-white/10"><span className="text-slate-400 font-mono text-xs font-bold uppercase tracking-widest mb-1">B-Roll Placeholder</span><span className="text-slate-600 font-mono text-[10px]">{filename}</span></div>'
        return full_tag

    pattern = r'<OffthreadVideo[^>]*src=\{\s*staticFile\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*\}[^>]*\/>'
    sanitized = re.sub(pattern, replace_missing, tsx_code, flags=re.DOTALL)
    pattern_video = r'<Video[^>]*src=\{\s*staticFile\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*\}[^>]*\/>'
    sanitized = re.sub(pattern_video, replace_missing, sanitized, flags=re.DOTALL)
    return sanitized
