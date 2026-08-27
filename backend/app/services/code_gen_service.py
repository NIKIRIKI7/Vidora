"""Сервис генерации и версионирования Remotion TSX компонентов."""

import json
from pathlib import Path
from typing import Any, Dict, Optional

from app.core.logging import add_log
from app.domain.exceptions import ProviderExecutionError, ResourceNotFoundError
from app.domain.schemas.code import CodeGenerationRequest, SaveRevisionRequest
from app.infrastructure.ai.llm.gateway import LLMGateway
from app.infrastructure.ai.llm.tsx_parser import extract_tsx
from app.infrastructure.storage.code_history_repo import CodeHistoryRepository
from app.infrastructure.storage.path_resolver import PathResolver


class CodeGenService:
    def __init__(
            self,
            llm_gateway: Optional[LLMGateway] = None,
            history_repo: Optional[CodeHistoryRepository] = None,
    ):
        self.llm_gateway = llm_gateway or LLMGateway()
        self.history_repo = history_repo or CodeHistoryRepository()

    def build_prompt(
            self, target_id: str, user_prompt: str, project_data: Optional[Dict[str, Any]]
    ) -> tuple[str, str]:
        system_prompt = (
            "You are an expert Remotion React TSX code generator. "
            "Output ONLY valid and clean TSX code inside a single ```tsx ... ``` block. "
            "Do not include any introductory or concluding comments."
        )
        context_str = ""
        if project_data:
            snippet = json.dumps(project_data, ensure_ascii=False, default=str)
            context_str = f"Context Project Data:\n{snippet[:4000]}\n\n"

        full_user_prompt = f"{context_str}Target Component/Scene: {target_id}\n\nTask:\n{user_prompt.strip()}"
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
        system_prompt, user_prompt = self.build_prompt(target_id, prompt, project_data)

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
