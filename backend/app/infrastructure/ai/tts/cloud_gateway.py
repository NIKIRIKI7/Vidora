"""Адаптер облачных шлюзов генерации речи."""

from pathlib import Path
from typing import Any

import httpx
from openai import AsyncOpenAI

from app.core.config import settings
from app.domain.exceptions import ProviderExecutionError
from app.infrastructure.ai.tts.base import BaseTTSProvider
from app.utils.audio_utils import extract_instruct_tag, clean_voice_tags, split_emotion_tag

_LOCAL_SPEAKERS = frozenset({"aria", "marcus", "nova", "kolya", "kseniya", "alloy", "clone"})
MINIMAX_DEFAULT_VOICE = "Russian_ReliableMan"
_OPENAI_MODEL_ALIAS = "tts-1"


class CloudGatewayTTSProvider(BaseTTSProvider):
    """Облачная генерация речи: ElevenLabs напрямую, RouterAI / AITunnel / OpenAI агрегаторы."""

    def __init__(self, model: str):
        self.model = model

    def _prep_payload(self, text: str, voice: str, is_minimax: bool, kwargs: dict):
        raw_voice = voice
        text, inline_instruct = extract_instruct_tag(text)
        text = clean_voice_tags(text)
        if voice in _LOCAL_SPEAKERS:
            voice = MINIMAX_DEFAULT_VOICE if is_minimax else "nova"
        extra: dict = {}
        if is_minimax:
            text, emotion = split_emotion_tag(text)
            extra["language_boost"] = "Russian"
            extra["voice_setting"] = {
                "speed": float(kwargs.get("speed", 1.0)),
                "pitch": int(kwargs.get("pitch", 0)),
            }
            if emotion:
                extra["voice_setting"]["emotion"] = emotion
        if inline_instruct or kwargs.get("design_prompt"):
            extra.setdefault("voice_setting", {})["design_prompt"] = (
                    inline_instruct or kwargs["design_prompt"]
            )
        if raw_voice == "clone" and kwargs.get("ref_audio_path"):
            extra.setdefault("voice_setting", {})["ref_audio_path"] = kwargs["ref_audio_path"]
        if kwargs.get("ref_text"):
            extra.setdefault("voice_setting", {})["ref_text"] = kwargs["ref_text"]
        return text, voice, extra

    async def generate_tts(
            self, text: str, voice_model: str, output_path: Path, **kwargs: Any
    ) -> None:
        api_keys = kwargs.get("api_keys") or {}

        if self.model.lower() == "elevenlabs":
            api_key = api_keys.get("elevenlabs") or settings.ELEVENLABS_API_KEY
            if not api_key:
                raise ProviderExecutionError("ElevenLabs API Key не настроен")
            voice_id = voice_model or "21m00Tcm4TlvDq8ikWAM"
            async with httpx.AsyncClient() as client:
                res = await client.post(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                    headers={"xi-api-key": api_key},
                    json={
                        "text": text,
                        "model_id": "eleven_monolingual_v1",
                        "voice_settings": {"stability": 0.5, "similarity_boost": 0.5},
                    },
                    timeout=60.0,
                )
                if res.status_code != 200:
                    raise ProviderExecutionError(f"ElevenLabs error: {res.text}")
                Path(output_path).write_bytes(res.content)
                return

        is_minimax = self.model.lower().startswith("minimax/")
        text, voice, extra_body = self._prep_payload(
            text, voice_model or "nova", is_minimax, kwargs
        )
        if not text:
            raise ValueError("Текст для озвучки пуст.")

        routes = [
            (
                api_keys.get("routerai") or settings.ROUTERAI_API_KEY,
                "https://routerai.ru/api/v1",
                "RouterAI",
            ),
            (
                api_keys.get("aitunnel") or settings.AITUNNEL_API_KEY,
                "https://api.aitunnel.ru/v1/",
                "AITUNNEL",
            ),
            (api_keys.get("openai") or settings.OPENAI_API_KEY, None, "OpenAI"),
        ]

        last_error = None
        for api_key, base, name in routes:
            if not api_key:
                continue
            try:
                client = (
                    AsyncOpenAI(api_key=api_key, base_url=base)
                    if base
                    else AsyncOpenAI(api_key=api_key)
                )
                model_name = (
                    self.model.split("/", 1)[-1]
                    if (name == "AITUNNEL" and "/" in self.model)
                    else self.model
                )
                if name == "OpenAI" and model_name in ("openai", _OPENAI_MODEL_ALIAS):
                    model_name = _OPENAI_MODEL_ALIAS

                response = await client.audio.speech.create(
                    model=model_name,
                    voice=voice,
                    input=text,
                    response_format="mp3" if is_minimax else "wav",
                    extra_body=extra_body or None,
                )
                Path(output_path).write_bytes(response.content)
                return
            except Exception as exc:
                last_error = exc

        raise ProviderExecutionError(f"Все шлюзы TTS недоступны. Последняя ошибка: {last_error}")
