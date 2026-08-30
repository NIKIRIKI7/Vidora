import os
import re
from pathlib import Path
from typing import Set
from app.core.config import settings
from app.infrastructure.remotion.widgets_registry import WidgetRegistry


def sanitize_tsx_for_missing_assets(tsx_code: str) -> str:
    """
    1. Заменяет несуществующие локальные видео/ассеты на безопасный моушн-плейсхолдер.
    2. Валидирует и автоматически добавляет корректные импорты виджетов из '../widgets'.
    """
    if not tsx_code:
        return tsx_code

    sanitized = tsx_code
    remo_public_dir = settings.REMOTION_DIR / "public"

    # 1. Защита от отсутствующих B-Roll файлов
    def replace_missing(match):
        full_tag = match.group(0)
        asset_path = match.group(1)
        clean_rel = asset_path.lstrip("/\\").replace("/", os.sep)
        dest_path = remo_public_dir / clean_rel
        alt_dest_path = remo_public_dir / "assets" / "b-roll" / Path(clean_rel).name

        if not dest_path.exists() and not alt_dest_path.exists():
            filename = Path(clean_rel).name
            return (
                f'<div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center p-8 border border-white/10">'
                f'<span className="text-slate-400 font-mono text-xs font-bold uppercase tracking-widest mb-1">B-Roll Placeholder</span>'
                f'<span className="text-slate-600 font-mono text-[10px]">{filename}</span>'
                f'</div>'
            )
        return full_tag

    pattern_offthread = r'<OffthreadVideo[^>]*src=\{\s*staticFile\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*\}[^>]*\/>'
    sanitized = re.sub(pattern_offthread, replace_missing, sanitized, flags=re.DOTALL)

    pattern_video = r'<Video[^>]*src=\{\s*staticFile\(\s*[\'"]([^\'"]+)[\'"]\s*\)\s*\}[^>]*\/>'
    sanitized = re.sub(pattern_video, replace_missing, sanitized, flags=re.DOTALL)

    # 2. Авто-исправление и дополнение импортов виджетов
    known_widgets = WidgetRegistry.get_valid_widget_names()
    used_widgets: Set[str] = set()

    for widget_name in known_widgets:
        if re.search(rf'<\s*{widget_name}\b', sanitized):
            used_widgets.add(widget_name)

    if used_widgets:
        import_match = re.search(
            r'import\s+\{([^}]+)\}\s+from\s+[\'"](?:\.\./widgets|@widgets)[\'"];?',
            sanitized,
            flags=re.DOTALL,
        )
        if import_match:
            existing_imported = {w.strip() for w in import_match.group(1).split(",") if w.strip()}
            merged_widgets = sorted(existing_imported.union(used_widgets))
            new_import_line = f"import {{ {', '.join(merged_widgets)} }} from '../widgets';"
            sanitized = re.sub(
                r'import\s+\{[^}]+\}\s+from\s+[\'"](?:\.\./widgets|@widgets)[\'"];?',
                new_import_line,
                sanitized,
                flags=re.DOTALL,
            )
        else:
            sorted_widgets = ", ".join(sorted(used_widgets))
            new_import_line = f"import {{ {sorted_widgets} }} from '../widgets';\n"
            sanitized = new_import_line + sanitized

    return sanitized
