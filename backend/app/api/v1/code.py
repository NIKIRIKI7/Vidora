"""Контроллер генерации и версионирования TSX компонентов + Motion Studio API."""

from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query, status

from app.api.dependencies import get_code_gen_service, get_skills_repository
from app.domain.exceptions import ResourceNotFoundError
from app.domain.schemas.code import (
    CodeGenerationRequest,
    CodeGenerationResponse,
    SaveRevisionRequest,
)
from app.domain.schemas.widgets import (
    CustomWidgetCreateRequest,
    CustomWidgetUpdateRequest,
    GenerateCustomWidgetAiRequest,
    WidgetCatalogResponse,
    WidgetCategory,
    WidgetCreationPromptResponse,
    WidgetCreationPromptUpdateRequest,
    WidgetDetailResponse,
    WidgetDocsResponse,
    WidgetPackageExport,
    WidgetPackageImportResponse,
    WidgetPromptUpdateRequest,
)
from app.domain.skills.models import SkillUpdate
from app.infrastructure.remotion.widgets_registry import WidgetRegistry
from app.infrastructure.skills.repository import SqliteSkillsRepository
from app.services.code_gen_service import CodeGenService

router = APIRouter(prefix="/code", tags=["Code Generation & Widgets"])


@router.post("/generate", response_model=CodeGenerationResponse)
async def generate_code(
    request: CodeGenerationRequest,
    service: CodeGenService = Depends(get_code_gen_service),
) -> CodeGenerationResponse:
    tsx_code = await service.generate_and_save(request)
    return CodeGenerationResponse(status="ok", tsx_code=tsx_code)


@router.post("/save")
async def save_code(
    req: SaveRevisionRequest,
    service: CodeGenService = Depends(get_code_gen_service),
) -> dict:
    out_path = await service.save_manual_revision(req)
    return {"status": "ok", "file_path": str(out_path)}


@router.get("/widgets", response_model=WidgetCatalogResponse)
def list_widgets(
    category: Optional[WidgetCategory] = Query(None, description="Фильтр по категории"),
    service: CodeGenService = Depends(get_code_gen_service),
) -> WidgetCatalogResponse:
    all_widgets = service.get_widget_catalog()
    if category:
        all_widgets = [w for w in all_widgets if w.category == category]
    categories = sorted(list({w.category.value for w in service.get_widget_catalog()}))
    return WidgetCatalogResponse(
        status="ok",
        total=len(all_widgets),
        widgets=all_widgets,
        categories=categories,
    )


@router.get("/widgets/docs", response_model=WidgetDocsResponse)
def get_widgets_docs(
    service: CodeGenService = Depends(get_code_gen_service),
) -> WidgetDocsResponse:
    markdown = service.get_widgets_documentation()
    all_widgets = service.get_widget_catalog()
    return WidgetDocsResponse(
        status="ok",
        markdown=markdown,
        total_widgets=len(all_widgets),
    )


@router.get("/widgets/export", response_model=WidgetPackageExport)
def export_widgets(
    ids: Optional[str] = Query(None, description="Список ID через запятую или пусто для всех"),
) -> WidgetPackageExport:
    id_list = [i.strip() for i in ids.split(",") if i.strip()] if ids else None
    return WidgetRegistry.export_package(id_list)


@router.post("/widgets/import", response_model=WidgetPackageImportResponse)
def import_widgets(
    payload: Dict[str, Any],
    overwrite: bool = Query(True, description="Перезаписывать существующие кастомные виджеты"),
) -> WidgetPackageImportResponse:
    return WidgetRegistry.import_package(payload, overwrite=overwrite)


@router.get("/widgets/creation-prompt", response_model=WidgetCreationPromptResponse)
async def get_creation_prompt(
    widget_id: Optional[str] = Query(None, description="ID виджета-референса (опционально)"),
    repo: SqliteSkillsRepository = Depends(get_skills_repository),
) -> WidgetCreationPromptResponse:
    """Получить системный мастер-промпт генерации виджетов (из БД)."""
    skill = await repo.get_by_id("custom_widget_creator")
    if not skill:
        raise ResourceNotFoundError("Системный скил custom_widget_creator не найден")
    prompt_text = skill.prompt

    if widget_id:
        widget = WidgetRegistry.get_widget(widget_id)
        if widget:
            ref_context = (
                f"\n\n=== REFERENCE TEMPLATE WIDGET: {widget.id} ===\n"
                f"Name: {widget.name}\n"
                f"Category: {widget.category.value}\n"
                f"Description: {widget.description}\n"
                f"Example Snippet:\n{widget.example_snippet}\n"
            )
            if widget.tsx_code:
                ref_context += f"Source TSX Code:\n```tsx\n{widget.tsx_code}\n```\n"
            prompt_text += ref_context

    return WidgetCreationPromptResponse(status="ok", prompt=prompt_text, is_custom=skill.is_custom)


@router.put("/widgets/creation-prompt", response_model=WidgetCreationPromptResponse)
async def update_creation_prompt(
    req: WidgetCreationPromptUpdateRequest,
    repo: SqliteSkillsRepository = Depends(get_skills_repository),
) -> WidgetCreationPromptResponse:
    """Сохранить отредактированный мастер-промпт создания кастомных виджетов (в БД)."""
    if not req.prompt or not req.prompt.strip():
        raise ResourceNotFoundError("Текст промпта создания виджетов не может быть пустым.")
    updated = await repo.update(
        "custom_widget_creator",
        SkillUpdate(prompt=req.prompt.strip(), is_active=True),
    )
    if not updated:
        raise ResourceNotFoundError("Системный скил custom_widget_creator не найден")
    return WidgetCreationPromptResponse(status="ok", prompt=updated.prompt, is_custom=True)


@router.put("/widgets/{widget_id}/prompt", response_model=WidgetDetailResponse)
def update_individual_widget_prompt(
    widget_id: str,
    req: WidgetPromptUpdateRequest,
) -> WidgetDetailResponse:
    """Обновить AI-сниппет, теги и описание для конкретного виджета."""
    meta = WidgetRegistry.update_widget_prompt(widget_id, req)
    return WidgetDetailResponse(status="ok", widget=meta)


@router.post("/widgets/ai-generate", response_model=WidgetDetailResponse, status_code=status.HTTP_201_CREATED)
async def generate_custom_widget_ai(
    req: GenerateCustomWidgetAiRequest,
    service: CodeGenService = Depends(get_code_gen_service),
) -> WidgetDetailResponse:
    meta = await service.generate_ai_custom_widget(req)
    return WidgetDetailResponse(status="ok", widget=meta)


@router.get("/widgets/{widget_id}", response_model=WidgetDetailResponse)
def get_widget_detail(
    widget_id: str,
    service: CodeGenService = Depends(get_code_gen_service),
) -> WidgetDetailResponse:
    widget = service.get_widget_detail(widget_id)
    if not widget:
        raise ResourceNotFoundError(f"Виджет '{widget_id}' не найден в реестре.")
    return WidgetDetailResponse(status="ok", widget=widget)


@router.post("/widgets", response_model=WidgetDetailResponse, status_code=status.HTTP_201_CREATED)
def create_custom_widget(
    req: CustomWidgetCreateRequest,
) -> WidgetDetailResponse:
    meta = WidgetRegistry.create_custom_widget(req)
    return WidgetDetailResponse(status="ok", widget=meta)


@router.put("/widgets/{widget_id}", response_model=WidgetDetailResponse)
def update_custom_widget(
    widget_id: str,
    req: CustomWidgetUpdateRequest,
) -> WidgetDetailResponse:
    meta = WidgetRegistry.update_custom_widget(widget_id, req)
    return WidgetDetailResponse(status="ok", widget=meta)


@router.delete("/widgets/{widget_id}")
def delete_custom_widget(
    widget_id: str,
) -> dict:
    success = WidgetRegistry.delete_custom_widget(widget_id)
    if not success:
        raise ResourceNotFoundError(f"Виджет '{widget_id}' не найден.")
    return {"status": "ok", "deleted_id": widget_id}
