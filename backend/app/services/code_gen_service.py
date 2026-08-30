"""Сервис генерации и версионирования Remotion TSX компонентов."""

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from app.core.logging import add_log
from app.domain.exceptions import ProviderExecutionError, ResourceNotFoundError, ValidationDomainError
from app.domain.schemas.code import CodeGenerationRequest, SaveRevisionRequest
from app.domain.schemas.widgets import (
    CustomWidgetCreateRequest,
    GenerateCustomWidgetAiRequest,
    WidgetCategory,
    WidgetMetadata,
    WidgetPackageExport,
)
from app.domain.skills.models import SkillStage
from app.domain.skills.prompt_builder import build_prompt_from_db_skills
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.ai.llm.tsx_parser import extract_tsx
from app.infrastructure.remotion.widgets_registry import WidgetRegistry
from app.infrastructure.skills.repository import SqliteSkillsRepository
from app.infrastructure.storage.code_history_repo import CodeHistoryRepository
from app.infrastructure.storage.path_resolver import PathResolver


class CodeGenService:
    def __init__(
        self,
        llm_gateway: Optional[LLMGateway] = None,
        history_repo: Optional[CodeHistoryRepository] = None,
        skills_repo: Optional[SqliteSkillsRepository] = None,
    ):
        self.llm_gateway = llm_gateway or LLMGateway()
        self.history_repo = history_repo or CodeHistoryRepository()
        self.skills_repo = skills_repo

    async def build_prompt(
        self,
        target_id: str,
        user_prompt: str,
        project_data: Optional[Dict[str, Any]],
    ) -> Tuple[str, str]:
        widgets_context = WidgetRegistry.generate_llm_system_prompt_context()
        if self.skills_repo:
            skills = await self.skills_repo.list_all(
                stage=SkillStage.SCENE_GENERATION, is_active=True
            )
            skills_context = build_prompt_from_db_skills(skills, stage=SkillStage.SCENE_GENERATION)
        else:
            skills_context = ""
        system_prompt = (
            "You are an Elite Remotion React TSX Motion Graphics Generator.\n"
            f"{skills_context}\n\n"
            f"{widgets_context}\n\n"
            "CRITICAL: Output ONLY valid, compile-ready TSX code inside a single ```tsx ... ``` markdown block. "
            "Never write introductory comments or explanations."
        )

        context_blocks = []
        if project_data:
            montage = project_data.get("montage", {})
            colors = montage.get("colors", {})
            context_blocks.append(
                f"PROJECT BRANDBOOK & PALETTE:\n"
                f"- Primary: {colors.get('primary', '#3b82f6')}\n"
                f"- Secondary: {colors.get('secondary', '#8b5cf6')}\n"
                f"- Background: {colors.get('background', '#0f172a')}\n"
                f"- Surface: {colors.get('surface', '#1e293b')}\n"
                f"- Accent: {colors.get('accent', '#06b6d4')}\n"
                f"- Text: {colors.get('text', '#f8fafc')}\n"
                f"- FPS: {montage.get('fps', 30)}\n"
                f"- Animation Style: {montage.get('animationStyle', 'cinematic_smooth')}"
            )
            scenes = project_data.get("scenes", [])
            for sc in scenes:
                if sc.get("id") == target_id:
                    context_blocks.append(
                        f"SCENE CONTEXT:\n- Title: {sc.get('title')}\n- Fragments: {len(sc.get('fragments', []))}"
                    )
                    break

        context_str = "\n\n".join(context_blocks)
        full_user_prompt = (
            f"{context_str}\n\n"
            f"TARGET COMPONENT/SCENE: {target_id}\n\n"
            f"DIRECTOR TASK / VISUAL REQUIREMENTS:\n{user_prompt.strip()}"
        )
        return system_prompt, full_user_prompt

    async def generate_code(
        self,
        prompt: str,
        target_id: str,
        engine: Optional[str] = None,
        project_data: Optional[Dict[str, Any]] = None,
        api_keys: Optional[Dict[str, Any]] = None,
    ) -> str:
        gateway = LLMGateway(api_keys) if api_keys else self.llm_gateway
        system_prompt, user_prompt = await self.build_prompt(target_id, prompt, project_data)
        raw_response = await gateway.generate_text(
            prompt=user_prompt,
            system_prompt=system_prompt,
            engine=engine or "ollama",
            max_tokens=4096,
        )
        if not raw_response or not raw_response.strip():
            raise ProviderExecutionError(f"LLM провайдер ({engine or 'default'}) вернул пустой ответ")
        tsx_code = extract_tsx(raw_response)
        if not tsx_code:
            raise ProviderExecutionError("Не удалось извлечь TSX блок из ответа модели")
        return tsx_code

    async def generate_ai_custom_widget(
        self, req: GenerateCustomWidgetAiRequest
    ) -> WidgetMetadata:
        gateway = LLMGateway(req.api_keys) if req.api_keys else self.llm_gateway
        if self.skills_repo:
            skills = await self.skills_repo.list_all(is_active=True)
            stage_enum = (
                SkillStage(req.stage)
                if req.stage and req.stage in SkillStage._value2member_map_
                else SkillStage.WIDGET_CREATION
            )
            skill_ctx = build_prompt_from_db_skills(
                skills,
                stage=stage_enum,
                specific_skill_id=req.skill_id or "custom_widget_creator",
            )
        else:
            skill_ctx = ""

        system_prompt = (
            f"{skill_ctx}\n\n"
            "CRITICAL FORMAT REQUIREMENT:\n"
            "Output ONLY valid JSON matching the WidgetPackageExport schema with 1 widget in the 'widgets' array. "
            "No preambles, no conversational filler."
        )

        user_prompt = (
            f"DESIGN & ANIMATION SPECIFICATION:\n{req.prompt.strip()}\n\n"
            f"Category: {req.category.value if req.category else 'custom'}\n"
            "Ensure full 3-phase dynamics (Entrance, Sustain loop, Outro) and 100% parameterization."
        )

        raw_response = await gateway.generate_text(
            prompt=user_prompt,
            system_prompt=system_prompt,
            engine=req.engine or "gemma3:4b",
            json_mode=True,
            max_tokens=4096,
        )
        if not raw_response:
            raise ProviderExecutionError("LLM не вернула результат для генерации виджета")

        clean_json = raw_response.strip()
        match = re.search(r"```(?:json)?\s*(.*?)\s*```", clean_json, re.DOTALL)
        if match:
            clean_json = match.group(1).strip()
        start = clean_json.find("{")
        end = clean_json.rfind("}")
        if start != -1 and end > start:
            clean_json = clean_json[start : end + 1]

        try:
            parsed = json.loads(clean_json)
        except Exception as e:
            raise ValidationDomainError(f"Сбой парсинга JSON ответа модели: {e}\nОтвет: {clean_json[:200]}")

        target_widget_dict = None
        if "widgets" in parsed and isinstance(parsed["widgets"], list) and len(parsed["widgets"]) > 0:
            target_widget_dict = parsed["widgets"][0]
        elif "id" in parsed and "tsx_code" in parsed:
            target_widget_dict = parsed
        else:
            raise ValidationDomainError("JSON от модели не содержит схемы виджета или массив 'widgets'.")

        create_req = CustomWidgetCreateRequest.model_validate(target_widget_dict)
        if req.category:
            create_req.category = req.category

        created_meta = WidgetRegistry.create_custom_widget(create_req)
        add_log("INFO", "CODE_GEN", f"AI успешно создал кастомный виджет '{created_meta.id}'")
        return created_meta

    def save_code_to_project(
        self,
        project_path: str,
        target_id: str,
        tsx_code: str,
        prompt: str = "",
    ) -> Path:
        proj_dir = PathResolver.resolve(project_path) or Path(project_path)
        out_file = proj_dir / "code" / "a-roll" / f"{PathResolver.sanitize_filename(target_id)}.tsx"
        out_file.parent.mkdir(parents=True, exist_ok=True)
        out_file.write_text(tsx_code, encoding="utf-8")
        self.history_repo.save_revision(project_path, target_id, tsx_code, prompt)
        add_log("INFO", "CODE_GEN", f"TSX код сохранен: {out_file.name}")
        return out_file

    async def generate_and_save(self, request: CodeGenerationRequest) -> str:
        api_keys_dict = request.api_keys.model_dump() if request.api_keys else {}
        project_dict = request.project_data.model_dump() if request.project_data else {}
        tsx_code = await self.generate_code(
            prompt=request.prompt,
            target_id=request.target_id,
            engine=request.engine,
            project_data=project_dict,
            api_keys=api_keys_dict,
        )
        self.save_code_to_project(
            project_path=request.project_path,
            target_id=request.target_id,
            tsx_code=tsx_code,
            prompt=request.prompt,
        )
        return tsx_code

    async def save_manual_revision(self, req: SaveRevisionRequest) -> Path:
        if not req.project_id or not req.scene_id:
            raise ResourceNotFoundError("ID проекта и сцены обязательны для сохранения")
        return self.save_code_to_project(
            project_path=req.project_id,
            target_id=req.scene_id,
            tsx_code=req.tsx_code,
            prompt=req.prompt,
        )

    def get_widget_catalog(self) -> List[WidgetMetadata]:
        return WidgetRegistry.get_all_widgets()

    def get_widget_detail(self, widget_id: str) -> Optional[WidgetMetadata]:
        return WidgetRegistry.get_widget(widget_id)

    def get_widgets_documentation(self) -> str:
        return WidgetRegistry.generate_markdown_documentation()
