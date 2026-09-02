"""Контроллер генерации и версионирования TSX компонентов."""

from fastapi import APIRouter, Depends

from app.api.dependencies import get_code_gen_service
from app.domain.schemas.code import (
    CodeGenerationRequest,
    CodeGenerationResponse,
    SaveRevisionRequest,
)
from app.services.code_gen_service import CodeGenService

router = APIRouter(prefix="/code", tags=["Code Generation"])


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
