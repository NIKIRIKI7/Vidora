"""Слой обратной совместимости для старых импортов исключений."""

# Функция для временной совместимости со старыми роутерами
from fastapi import HTTPException, status

from app.domain.exceptions import (
    SecurityPathViolationError,
    SecurityPathException,
    ResourceNotFoundError,
    ResourceNotFoundException,
    ProviderExecutionError,
    ProviderExecutionException,
    RenderProcessError,
    RenderProcessException,
)


def raise_http_error(exc: Exception) -> None:
    if isinstance(exc, HTTPException):
        raise exc
    if isinstance(exc, (SecurityPathViolationError, SecurityPathException)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    elif isinstance(exc, (ResourceNotFoundError, ResourceNotFoundException)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    elif isinstance(exc,
                    (ProviderExecutionError, ProviderExecutionException, RenderProcessError, RenderProcessException)):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))
    else:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc))
