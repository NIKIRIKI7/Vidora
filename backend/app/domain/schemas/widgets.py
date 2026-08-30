from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class WidgetCategory(str, Enum):
    CORE = "core"
    SOCIAL = "social"
    TECH = "tech"
    METRICS = "metrics"
    NARRATIVE = "narrative"
    LAYOUT = "layout"
    CUSTOM = "custom"


class PropType(str, Enum):
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    ARRAY_STRING = "string[]"
    ARRAY_NUMBER = "number[]"
    OBJECT = "object"
    ENUM = "enum"


class WidgetPropDefinition(BaseModel):
    name: str = Field(..., description="Имя пропса в camelCase")
    type: PropType = Field(..., description="Тип данных пропса")
    required: bool = Field(default=False, description="Обязателен ли параметр")
    default: Optional[Any] = Field(default=None, description="Значение по умолчанию")
    description: str = Field(..., description="Человекочитаемое описание назначения пропса")
    enum_values: Optional[List[str]] = Field(default=None, description="Допустимые значения для типа enum")


class WidgetMetadata(BaseModel):
    id: str = Field(..., description="Уникальный идентификатор виджета (например, TweetCard)")
    name: str = Field(..., description="Название виджета")
    category: WidgetCategory = Field(..., description="Категория виджета")
    description: str = Field(..., description="Подробное описание назначения виджета в видео")
    import_path: str = Field(default="../widgets", description="Путь импорта в TSX")
    is_custom: bool = Field(default=False, description="Флаг пользовательского компонента")
    props: List[WidgetPropDefinition] = Field(default_factory=list, description="Список пропсов компонента")
    default_props: Dict[str, Any] = Field(default_factory=dict, description="Значения пропсов по умолчанию")
    tsx_code: Optional[str] = Field(default=None, description="Исходный TSX код для кастомных виджетов")
    example_snippet: str = Field(default="", description="Эталонный пример вызова компонента для LLM")
    tags: List[str] = Field(default_factory=list, description="Поисковые теги")


class CustomWidgetCreateRequest(BaseModel):
    id: str = Field(..., description="Уникальный идентификатор компонента в PascalCase")
    name: str = Field(..., description="Название компонента")
    category: WidgetCategory = Field(default=WidgetCategory.CUSTOM, description="Категория")
    description: str = Field(..., description="Описание назначения компонента")
    props: List[WidgetPropDefinition] = Field(default_factory=list, description="Список пропсов")
    default_props: Dict[str, Any] = Field(default_factory=dict, description="Дефолтные значения")
    tsx_code: str = Field(..., description="Полный React/Remotion TSX код компонента")
    example_snippet: Optional[str] = Field(default=None, description="Пример вызова")
    tags: List[str] = Field(default_factory=list, description="Теги")


class CustomWidgetUpdateRequest(BaseModel):
    name: Optional[str] = None
    category: Optional[WidgetCategory] = None
    description: Optional[str] = None
    props: Optional[List[WidgetPropDefinition]] = None
    default_props: Optional[Dict[str, Any]] = None
    tsx_code: Optional[str] = None
    example_snippet: Optional[str] = None
    tags: Optional[List[str]] = None


class GenerateCustomWidgetAiRequest(BaseModel):
    prompt: str = Field(..., description="Описание виджета, визуальной метафоры и поведения")
    skill_id: Optional[str] = Field(default="custom_widget_creator", description="ID скила для применения")
    stage: Optional[str] = Field(default="widget_creation", description="Этап применения промпта")
    engine: Optional[str] = Field(default=None, description="LLM модель для генерации")
    category: Optional[WidgetCategory] = Field(default=WidgetCategory.CUSTOM, description="Категория виджета")
    api_keys: Optional[Dict[str, Any]] = Field(default_factory=dict, description="API ключи провайдеров")


class WidgetPackageExport(BaseModel):
    vidora_schema_version: str = "1.0"
    exported_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    generator: str = "Vidora Motion Studio"
    widgets: List[WidgetMetadata]


class WidgetPackageImportRequest(BaseModel):
    vidora_schema_version: Optional[str] = "1.0"
    widgets: List[WidgetMetadata]
    overwrite: bool = True


class WidgetPackageImportResponse(BaseModel):
    status: str = "ok"
    imported_count: int
    imported_ids: List[str]
    skipped_ids: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)


class WidgetCatalogResponse(BaseModel):
    status: str = "ok"
    total: int
    widgets: List[WidgetMetadata]
    categories: List[str]


class WidgetDetailResponse(BaseModel):
    status: str = "ok"
    widget: WidgetMetadata


class WidgetDocsResponse(BaseModel):
    status: str = "ok"
    markdown: str
    total_widgets: int


class WidgetPromptUpdateRequest(BaseModel):
    example_snippet: Optional[str] = Field(None, description="Эталонный TSX вызов виджета для LLM")
    description: Optional[str] = Field(None, description="Описание логики и назначения виджета")
    tags: Optional[List[str]] = Field(None, description="Теги виджета")


class WidgetCreationPromptResponse(BaseModel):
    status: str = "ok"
    prompt: str = Field(..., description="Текущий системный промпт создания виджетов")
    skill_id: str = "custom_widget_creator"
    is_custom: bool = False


class WidgetCreationPromptUpdateRequest(BaseModel):
    prompt: str = Field(..., description="Новый текст системного промпта для создания виджетов")
