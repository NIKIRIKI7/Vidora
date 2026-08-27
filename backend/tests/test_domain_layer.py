"""Самопроверка доменного слоя: маппинг исключений в HTTP и обратная совместимость."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.error_handlers import register_exception_handlers
from app.domain.exceptions import (
    VidoraException,
    ResourceNotFoundError,
    SecurityPathViolationError,
    ProviderExecutionError,
    RenderProcessError,
    ValidationDomainError,
)
from app.core.exceptions import raise_http_error, SecurityPathException, ResourceNotFoundException

from fastapi import HTTPException


def _make_client():
    app = FastAPI()

    @app.get("/boom/{kind}")
    def boom(kind: str):
        raise {
            "not_found": ResourceNotFoundError("нет ресурса"),
            "security": SecurityPathViolationError("выход из песочницы"),
            "provider": ProviderExecutionError("провайдер упал"),
            "render": RenderProcessError("рендер сломался"),
            "validation": ValidationDomainError("плохие параметры"),
            "generic": VidoraException("неизвестная беда"),
        }[kind]

    register_exception_handlers(app)
    return TestClient(app)


def test_exception_to_status_mapping():
    client = _make_client()
    expected = {
        "not_found": 404,
        "security": 403,
        "provider": 502,
        "render": 500,
        "validation": 422,
        "generic": 500,
    }
    for kind, code in expected.items():
        resp = client.get(f"/boom/{kind}")
        body = resp.json()
        assert resp.status_code == code, f"{kind}: {resp.status_code} != {code}"
        assert body["status"] == "error"
        assert isinstance(body["error_code"], str) and body["error_code"]
        assert "detail" in body


def test_compat_aliases_and_raise_http_error():
    assert SecurityPathException is SecurityPathViolationError
    assert ResourceNotFoundException is ResourceNotFoundError

    from app.schemas.audio import AudioGenerationRequest
    from app.domain.schemas.audio import AudioGenerationRequest as DomainAudioReq
    assert AudioGenerationRequest is DomainAudioReq

    try:
        raise_http_error(ResourceNotFoundError("x"))
    except HTTPException as e:
        assert e.status_code == 404
    else:
        raise AssertionError("raise_http_error должен кидать HTTPException")

    try:
        raise_http_error(HTTPException(status_code=404, detail="x"))
    except HTTPException as e:
        assert e.status_code == 404
    else:
        raise AssertionError("HTTPException должен проходить сквозь raise_http_error")


if __name__ == "__main__":
    test_exception_to_status_mapping()
    test_compat_aliases_and_raise_http_error()
    print("domain layer OK")
