import pytest
from app.domain.schemas.widgets import (
    CustomWidgetCreateRequest,
    CustomWidgetUpdateRequest,
    PropType,
    WidgetCategory,
    WidgetPropDefinition,
)
from app.infrastructure.remotion.tsx_sanitizer import sanitize_tsx_for_missing_assets
from app.infrastructure.remotion.widgets_registry import WidgetRegistry
from app.services.code_gen_service import CodeGenService


def test_widget_registry_starts_empty(tmp_path, monkeypatch):
    test_storage = tmp_path / "custom_widgets.json"
    monkeypatch.setattr(WidgetRegistry, "_custom_widgets_file", test_storage)
    monkeypatch.setattr(WidgetRegistry, "_CUSTOM_WIDGETS", {})

    widgets = WidgetRegistry.get_all_widgets()
    assert len(widgets) == 0
    assert WidgetRegistry.generate_llm_system_prompt_context() == ""


def test_widget_registry_crud_custom_widget(tmp_path, monkeypatch):
    test_storage = tmp_path / "custom_widgets.json"
    monkeypatch.setattr(WidgetRegistry, "_custom_widgets_file", test_storage)
    monkeypatch.setattr(WidgetRegistry, "_CUSTOM_WIDGETS", {})

    # 1. Создание
    create_req = CustomWidgetCreateRequest(
        id="CyberAlertBadge",
        name="Кибер-бейдж",
        category=WidgetCategory.CUSTOM,
        description="Неоновый бейдж с предупреждением",
        props=[
            WidgetPropDefinition(
                name="alertLevel",
                type=PropType.STRING,
                required=True,
                default="CRITICAL",
                description="Уровень опасности",
            )
        ],
        default_props={"alertLevel": "CRITICAL"},
        tsx_code="export const CyberAlertBadge = () => <div />;",
        example_snippet='<CyberAlertBadge alertLevel="CRITICAL" />',
        tags=["alert", "cyber"],
    )

    created = WidgetRegistry.create_custom_widget(create_req)
    assert created.id == "CyberAlertBadge"
    assert created.is_custom is True

    # 2. Получение
    fetched = WidgetRegistry.get_widget("CyberAlertBadge")
    assert fetched is not None
    assert fetched.name == "Кибер-бейдж"

    # 3. Обновление
    update_req = CustomWidgetUpdateRequest(name="Кибер-бейдж 2.0", description="Обновленное описание")
    updated = WidgetRegistry.update_custom_widget("CyberAlertBadge", update_req)
    assert updated.name == "Кибер-бейдж 2.0"

    # 4. Проверка генерации промпта
    prompt_ctx = WidgetRegistry.generate_llm_system_prompt_context()
    assert "<CyberAlertBadge />" in prompt_ctx
    assert "• alertLevel: string" in prompt_ctx

    # 5. Удаление
    deleted = WidgetRegistry.delete_custom_widget("CyberAlertBadge")
    assert deleted is True
    assert WidgetRegistry.get_widget("CyberAlertBadge") is None


def test_export_and_import_package(tmp_path, monkeypatch):
    test_storage = tmp_path / "custom_widgets.json"
    monkeypatch.setattr(WidgetRegistry, "_custom_widgets_file", test_storage)
    monkeypatch.setattr(WidgetRegistry, "_CUSTOM_WIDGETS", {})

    import_payload = {
        "vidora_schema_version": "1.0",
        "widgets": [
            {
                "id": "MyStatBox",
                "name": "Статистика",
                "category": "metrics",
                "description": "Тестовый импорт",
                "import_path": "../widgets",
                "is_custom": True,
                "props": [],
                "default_props": {},
                "example_snippet": "<MyStatBox />",
                "tags": ["stats"],
            }
        ],
    }

    resp = WidgetRegistry.import_package(import_payload, overwrite=True)
    assert resp.imported_count == 1
    assert "MyStatBox" in resp.imported_ids
    assert WidgetRegistry.get_widget("MyStatBox") is not None


def test_tsx_sanitizer_auto_injects_custom_widget_imports(tmp_path, monkeypatch):
    test_storage = tmp_path / "custom_widgets.json"
    monkeypatch.setattr(WidgetRegistry, "_custom_widgets_file", test_storage)
    monkeypatch.setattr(WidgetRegistry, "_CUSTOM_WIDGETS", {})

    WidgetRegistry.create_custom_widget(
        CustomWidgetCreateRequest(
            id="HeroHeader",
            name="Главный заголовок",
            category=WidgetCategory.CUSTOM,
            description="Заголовок сцены",
            tsx_code="export const HeroHeader = () => <h1 />;",
        )
    )

    raw_tsx = """
    export const Scene = () => {
        return (
            <div className="w-full h-full bg-slate-950 flex items-center justify-center">
                <HeroHeader />
            </div>
        );
    };
    """
    sanitized = sanitize_tsx_for_missing_assets(raw_tsx)
    assert "import { HeroHeader } from '../widgets';" in sanitized
