"""DTO-схемы системных операций и загрузки моделей."""

from pydantic import BaseModel


class PullRequest(BaseModel):
    engine: str
