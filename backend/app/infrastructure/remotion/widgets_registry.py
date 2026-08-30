import json
import re
import threading
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from app.core.config import settings
from app.core.logging import add_log
from app.domain.exceptions import ValidationDomainError
from app.domain.schemas.widgets import (
    CustomWidgetCreateRequest,
    CustomWidgetUpdateRequest,
    PropType,
    WidgetCategory,
    WidgetMetadata,
    WidgetPackageExport,
    WidgetPackageImportResponse,
    WidgetPropDefinition,
)

COMMON_BASE_PROPS: List[WidgetPropDefinition] = [
    WidgetPropDefinition(
        name="delayFrames",
        type=PropType.NUMBER,
        required=False,
        default=0,
        description="Задержка старта анимации появления виджета (в кадрах)",
    ),
    WidgetPropDefinition(
        name="durationFrames",
        type=PropType.NUMBER,
        required=False,
        default=None,
        description="Полная длительность отображения виджета на экране (в кадрах)",
    ),
    WidgetPropDefinition(
        name="animation",
        type=PropType.ENUM,
        required=False,
        default="spring-pop",
        description="Физический тип анимации входа",
        enum_values=["spring-pop", "slide-up", "fade", "zoom-in", "tilt-3d", "static"],
    ),
    WidgetPropDefinition(
        name="scale",
        type=PropType.NUMBER,
        required=False,
        default=1.0,
        description="Множитель масштаба компонента",
    ),
    WidgetPropDefinition(
        name="className",
        type=PropType.STRING,
        required=False,
        default="",
        description="Дополнительные классы Tailwind CSS для позиционирования",
    ),
]


class WidgetRegistry:
    """
    Центральный реестр виджетов.
    Встроенные компоненты очищены — реестр управляет пользовательскими виджетами (CRUD, JSON импорт/экспорт).
    """

    # RLock: update/delete вызывают get_widget() внутри with self._lock (вложенный захват)
    _lock = threading.RLock()
    _custom_widgets_file: Path = settings.DATA_STORAGE_DIR / "custom_widgets.json"

    # Полностью пустой список встроенных компонентов
    _BUILTIN_WIDGETS: Dict[str, WidgetMetadata] = {}
    _CUSTOM_WIDGETS: Dict[str, WidgetMetadata] = {}

    @classmethod
    def _sanitize_widget_id(cls, raw_id: str) -> str:
        clean = re.sub(r"[^a-zA-Z0-9_]", "", raw_id.strip())
        if not clean or not clean[0].isalpha():
            clean = f"Widget{clean}"
        return clean

    @classmethod
    def _load_custom_widgets_from_disk(cls) -> None:
        if not cls._custom_widgets_file.exists():
            cls._CUSTOM_WIDGETS.clear()
            return

        try:
            content = cls._custom_widgets_file.read_text(encoding="utf-8")
            data = json.loads(content)
            loaded: Dict[str, WidgetMetadata] = {}
            for item in data.get("widgets", []):
                meta = WidgetMetadata.model_validate(item)
                meta.is_custom = True
                loaded[meta.id] = meta
            cls._CUSTOM_WIDGETS = loaded
        except Exception as e:
            add_log("WARN", "WIDGET_REGISTRY", f"Ошибка загрузки кастомных виджетов: {e}")

    @classmethod
    def _save_custom_widgets_to_disk(cls) -> None:
        try:
            cls._custom_widgets_file.parent.mkdir(parents=True, exist_ok=True)
            payload = {
                "version": "1.0",
                "widgets": [w.model_dump() for w in cls._CUSTOM_WIDGETS.values()],
            }
            cls._custom_widgets_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as e:
            add_log("ERROR", "WIDGET_REGISTRY", f"Ошибка сохранения custom_widgets.json: {e}")

    @classmethod
    def _write_custom_tsx_source(cls, widget_id: str, tsx_code: str) -> None:
        try:
            custom_dir = settings.REMOTION_DIR / "src" / "widgets" / "custom"
            custom_dir.mkdir(parents=True, exist_ok=True)
            file_path = custom_dir / f"{widget_id}.tsx"
            file_path.write_text(tsx_code, encoding="utf-8")
        except Exception:
            pass

    @classmethod
    def get_all_widgets(cls) -> List[WidgetMetadata]:
        with cls._lock:
            cls._load_custom_widgets_from_disk()
            combined = {**cls._BUILTIN_WIDGETS, **cls._CUSTOM_WIDGETS}
            return list(combined.values())

    @classmethod
    def get_widget(cls, widget_id: str) -> Optional[WidgetMetadata]:
        if not widget_id:
            return None
        target = widget_id.strip().lower()
        with cls._lock:
            cls._load_custom_widgets_from_disk()
            combined = {**cls._BUILTIN_WIDGETS, **cls._CUSTOM_WIDGETS}
            for key, widget in combined.items():
                if key.lower() == target:
                    return widget
            return None

    @classmethod
    def get_valid_widget_names(cls) -> Set[str]:
        with cls._lock:
            cls._load_custom_widgets_from_disk()
            combined = {**cls._BUILTIN_WIDGETS, **cls._CUSTOM_WIDGETS}
            return set(combined.keys())

    @classmethod
    def create_custom_widget(cls, req: CustomWidgetCreateRequest) -> WidgetMetadata:
        clean_id = cls._sanitize_widget_id(req.id)

        with cls._lock:
            cls._load_custom_widgets_from_disk()
            if clean_id in cls._CUSTOM_WIDGETS:
                raise ValidationDomainError(f"Компонент с ID '{clean_id}' уже существует.")

            merged_props = [*COMMON_BASE_PROPS]
            existing_prop_names = {p.name for p in merged_props}
            for p in req.props:
                if p.name not in existing_prop_names:
                    merged_props.append(p)
                    existing_prop_names.add(p.name)

            snippet = req.example_snippet or f"<{clean_id} />"
            meta = WidgetMetadata(
                id=clean_id,
                name=req.name.strip(),
                category=req.category,
                description=req.description.strip(),
                import_path="../widgets",
                is_custom=True,
                props=merged_props,
                default_props=req.default_props,
                tsx_code=req.tsx_code,
                example_snippet=snippet,
                tags=req.tags or ["custom"],
            )

            cls._CUSTOM_WIDGETS[clean_id] = meta
            cls._save_custom_widgets_to_disk()
            cls._write_custom_tsx_source(clean_id, req.tsx_code)
            add_log("INFO", "WIDGET_REGISTRY", f"Создан виджет: {clean_id}")
            return meta

    @classmethod
    def update_custom_widget(cls, widget_id: str, req: CustomWidgetUpdateRequest) -> WidgetMetadata:
        with cls._lock:
            cls._load_custom_widgets_from_disk()
            meta = cls.get_widget(widget_id)
            if not meta:
                raise ValidationDomainError(f"Виджет '{widget_id}' не найден.")

            if req.name is not None:
                meta.name = req.name.strip()
            if req.category is not None:
                meta.category = req.category
            if req.description is not None:
                meta.description = req.description.strip()
            if req.props is not None:
                merged = [*COMMON_BASE_PROPS]
                names = {p.name for p in merged}
                for p in req.props:
                    if p.name not in names:
                        merged.append(p)
                        names.add(p.name)
                meta.props = merged
            if req.default_props is not None:
                meta.default_props = req.default_props
            if req.tsx_code is not None:
                meta.tsx_code = req.tsx_code
                cls._write_custom_tsx_source(meta.id, req.tsx_code)
            if req.example_snippet is not None:
                meta.example_snippet = req.example_snippet
            if req.tags is not None:
                meta.tags = req.tags

            cls._CUSTOM_WIDGETS[meta.id] = meta
            cls._save_custom_widgets_to_disk()
            add_log("INFO", "WIDGET_REGISTRY", f"Обновлен виджет: {meta.id}")
            return meta

    @classmethod
    def delete_custom_widget(cls, widget_id: str) -> bool:
        with cls._lock:
            cls._load_custom_widgets_from_disk()
            meta = cls.get_widget(widget_id)
            if not meta:
                return False

            if meta.id in cls._CUSTOM_WIDGETS:
                del cls._CUSTOM_WIDGETS[meta.id]
                cls._save_custom_widgets_to_disk()
                custom_file = settings.REMOTION_DIR / "src" / "widgets" / "custom" / f"{meta.id}.tsx"
                if custom_file.exists():
                    custom_file.unlink(missing_ok=True)
                add_log("INFO", "WIDGET_REGISTRY", f"Удален виджет: {meta.id}")
                return True
            return False

    @classmethod
    def export_package(cls, widget_ids: Optional[List[str]] = None) -> WidgetPackageExport:
        all_widgets = cls.get_all_widgets()
        if widget_ids:
            target_ids = {i.strip().lower() for i in widget_ids if i}
            selected = [w for w in all_widgets if w.id.lower() in target_ids]
        else:
            selected = all_widgets

        return WidgetPackageExport(widgets=selected)

    @classmethod
    def import_package(cls, pkg_data: Dict[str, Any], overwrite: bool = True) -> WidgetPackageImportResponse:
        try:
            parsed = WidgetPackageExport.model_validate(pkg_data)
        except Exception as e:
            raise ValidationDomainError(f"Некорректная структура JSON пакета виджетов: {e}")

        imported_ids: List[str] = []
        skipped_ids: List[str] = []
        errors: List[str] = []

        with cls._lock:
            cls._load_custom_widgets_from_disk()
            for w in parsed.widgets:
                w_id = cls._sanitize_widget_id(w.id)

                if w_id in cls._CUSTOM_WIDGETS and not overwrite:
                    skipped_ids.append(w_id)
                    continue

                try:
                    w.id = w_id
                    w.is_custom = True
                    cls._CUSTOM_WIDGETS[w_id] = w
                    if w.tsx_code:
                        cls._write_custom_tsx_source(w_id, w.tsx_code)
                    imported_ids.append(w_id)
                except Exception as err:
                    errors.append(f"{w_id}: {err}")

            cls._save_custom_widgets_to_disk()

        add_log("INFO", "WIDGET_REGISTRY", f"Импортировано {len(imported_ids)} виджетов из JSON-пакета.")
        return WidgetPackageImportResponse(
            status="ok",
            imported_count=len(imported_ids),
            imported_ids=imported_ids,
            skipped_ids=skipped_ids,
            errors=errors,
        )

    @classmethod
    def generate_llm_system_prompt_context(cls) -> str:
        widgets = cls.get_all_widgets()
        if not widgets:
            return ""

        lines = [
            "=== VIDORA PRE-ANIMATED MOTION WIDGETS ===",
            "You have access to a library of deterministic Remotion React widgets.",
            "Import any available widget directly from '../widgets'. Example:",
            f"import {{ {', '.join(w.id for w in widgets[:4])} }} from '../widgets';",
            "",
            "AVAILABLE WIDGETS AND PROPS SPECIFICATION:",
        ]

        for w in widgets:
            lines.append(f"\n<{w.id} /> - {w.description}")
            for p in w.props:
                req_mark = "(REQUIRED)" if p.required else f"(optional, default: {p.default})"
                enum_hint = f" [{', '.join(p.enum_values)}]" if p.enum_values else ""
                lines.append(f"  • {p.name}: {p.type.value}{enum_hint} {req_mark} - {p.description}")
            if w.example_snippet:
                lines.append(f"Example usage:\n{w.example_snippet}")

        lines.extend([
            "",
            "CRITICAL RULES FOR SCENE COMPOSITION:",
            "1. Wrap the entire scene in an absolute full-screen container: <div className=\"w-full h-full bg-slate-950 flex flex-col items-center justify-center p-12\">.",
            "2. Combine background effects with widgets.",
            "3. Stagger widget appearances using `delayFrames`.",
            "4. Return ONLY valid, clean TypeScript TSX code inside a single ```tsx ... ``` block.",
        ])

        return "\n".join(lines)

    @classmethod
    def generate_markdown_documentation(cls) -> str:
        widgets = cls.get_all_widgets()
        if not widgets:
            return "# Документация библиотеки виджетов Vidora\n\nБиблиотека компонентов пуста. Создайте свой первый компонент в Motion Studio."

        docs = [
            "# Документация библиотеки виджетов Vidora Motion Widgets\n",
            "## Содержание\n",
        ]

        for w in widgets:
            docs.append(f"- [{w.name} (`<{w.id} />`)](#{w.id.lower()})")

        docs.append("\n---\n")

        for w in widgets:
            docs.append(f"## {w.name} (`<{w.id} />`)\n")
            docs.append(f"**Категория:** `{w.category.value}`  \n**Описание:** {w.description}\n")
            docs.append("### Таблица пропсов:\n")
            docs.append("| Имя | Тип | Обязателен | По умолчанию | Описание |")
            docs.append("| :--- | :--- | :--- | :--- | :--- |")
            for p in w.props:
                enums = f"<br>_Варианты: `{', '.join(p.enum_values)}`_" if p.enum_values else ""
                req = "**Да**" if p.required else "Нет"
                default_val = f"`{p.default}`" if p.default is not None else "-"
                docs.append(f"| `{p.name}` | `{p.type.value}` | {req} | {default_val} | {p.description}{enums} |")

            if w.example_snippet:
                docs.append("\n### Пример вызова в TSX:\n")
                docs.append(f"```tsx\nimport {{ {w.id} }} from '../widgets';\n\n{w.example_snippet}\n```\n")
            docs.append("---\n")

        return "\n".join(docs)
