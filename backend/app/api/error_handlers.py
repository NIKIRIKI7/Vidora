"""Глобальные обработчики исключений для FastAPI приложения."""

import traceback

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.core.logging import add_log
from app.domain.exceptions import (
    VidoraException,
    ResourceNotFoundError,
    SecurityPathViolationError,
    ProviderExecutionError,
    RenderProcessError,
    ValidationDomainError,
)


def register_exception_handlers(app: FastAPI) -> None:
    """Регистрирует все глобальные перехватчики исключений в FastAPI."""

    @app.exception_handler(ResourceNotFoundError)
    async def resource_not_found_handler(request: Request, exc: ResourceNotFoundError) -> JSONResponse:
        add_log("WARN", "HTTP_404", f"Ресурс не найден: {exc.message} ({request.method} {request.url.path})")
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "status": "error",
                "error_code": exc.error_code,
                "detail": exc.message,
                "details": exc.details,
            },
        )

    @app.exception_handler(SecurityPathViolationError)
    async def security_path_handler(request: Request, exc: SecurityPathViolationError) -> JSONResponse:
        add_log("ERROR", "SECURITY", f"Нарушение безопасности путей: {exc.message} ({request.url.path})")
        return JSONResponse(
            status_code=status.HTTP_403_FORBIDDEN,
            content={
                "status": "error",
                "error_code": exc.error_code,
                "detail": exc.message,
                "details": exc.details,
            },
        )

    @app.exception_handler(ProviderExecutionError)
    async def provider_execution_handler(request: Request, exc: ProviderExecutionError) -> JSONResponse:
        add_log("ERROR", "AI_PROVIDER", f"Ошибка провайдера: {exc.message}")
        return JSONResponse(
            status_code=status.HTTP_502_BAD_GATEWAY,
            content={
                "status": "error",
                "error_code": exc.error_code,
                "detail": exc.message,
                "details": exc.details,
            },
        )

    @app.exception_handler(RenderProcessError)
    async def render_process_handler(request: Request, exc: RenderProcessError) -> JSONResponse:
        add_log("ERROR", "RENDER", f"Ошибка рендера: {exc.message}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "error_code": exc.error_code,
                "detail": exc.message,
                "details": exc.details,
            },
        )

    @app.exception_handler(ValidationDomainError)
    async def validation_domain_handler(request: Request, exc: ValidationDomainError) -> JSONResponse:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "status": "error",
                "error_code": exc.error_code,
                "detail": exc.message,
                "details": exc.details,
            },
        )

    @app.exception_handler(VidoraException)
    async def generic_vidora_handler(request: Request, exc: VidoraException) -> JSONResponse:
        add_log("ERROR", "DOMAIN", f"Доменная ошибка: {exc.message}")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "error_code": exc.error_code,
                "detail": exc.message,
                "details": exc.details,
            },
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        errors = exc.errors()
        error_details = [
            {"loc": list(err.get("loc", [])), "msg": err.get("msg"), "type": err.get("type")}
            for err in errors
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "status": "error",
                "error_code": "REQUEST_VALIDATION_ERROR",
                "detail": "Некорректные параметры запроса",
                "errors": error_details,
            },
        )

    @app.exception_handler(Exception)
    async def global_unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        err_trace = traceback.format_exc()
        add_log(
            "ERROR",
            "HTTP_CRASH",
            f"Необработанная ошибка {request.method} {request.url.path}: {str(exc)}",
            details=err_trace,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "status": "error",
                "error_code": "INTERNAL_SERVER_ERROR",
                "detail": f"Внутренняя ошибка сервера: {str(exc)}",
            },
        )
