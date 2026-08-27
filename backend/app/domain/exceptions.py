"""Доменные исключения приложения Vidora."""

from typing import Any, Dict, Optional


class VidoraException(Exception):
    """Базовое исключение домена Vidora."""

    def __init__(
            self,
            message: str,
            error_code: str = "INTERNAL_DOMAIN_ERROR",
            details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.error_code = error_code
        self.details = details or {}
        super().__init__(message)


class ResourceNotFoundError(VidoraException):
    """Ресурс (файл, проект, сцена, ревизия) не найден."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, error_code="RESOURCE_NOT_FOUND", details=details)


class SecurityPathViolationError(VidoraException):
    """Попытка Path Traversal или обращения к файлу вне разрешенной песочницы."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, error_code="SECURITY_PATH_VIOLATION", details=details)


class ProviderExecutionError(VidoraException):
    """Сбой выполнения внешнего AI/TTS/LLM провайдера."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, error_code="AI_PROVIDER_ERROR", details=details)


class RenderProcessError(VidoraException):
    """Ошибка процесса рендеринга Remotion или FFmpeg мультиплексирования."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, error_code="RENDER_PROCESS_ERROR", details=details)


class ValidationDomainError(VidoraException):
    """Ошибка валидации бизнес-логики (например, недопустимая комбинация параметров)."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        super().__init__(message=message, error_code="VALIDATION_ERROR", details=details)


# --- Алиасы для обратной совместимости со старым кодом ---
SecurityPathException = SecurityPathViolationError
ResourceNotFoundException = ResourceNotFoundError
ProviderExecutionException = ProviderExecutionError
RenderProcessException = RenderProcessError
