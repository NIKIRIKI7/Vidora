import os
import re
import wave
import struct
import asyncio
import concurrent.futures
import logging
from abc import ABC, abstractmethod
from typing import Optional
import numpy as np
import httpx

_EMOTION_TAG_RE = re.compile(r'\[emotion:\s*([a-z-]+)\]', re.IGNORECASE)
# ponytail: 2.8-hd не поддерживает whisper/fluent (это 2.6) — держим строгий набор для нашей модели
_MINIMAX_EMOTIONS = frozenset({"happy", "sad", "angry", "fearful", "disgusted", "surprised", "calm"})
_LOCAL_SPEAKERS = frozenset({"aria", "marcus", "nova", "kolya", "kseniya", "alloy", "clone"})
MINIMAX_DEFAULT_VOICE = "English_expressive_narrator"


def split_emotion_tag(text: str):
    """Вытаскивает '[emotion: calm]' из текста: (текст_без_тега, эмоция | None).
    Невалидная эмоция тоже вырезается из текста — иначе диктор произнесёт её вслух."""
    match = _EMOTION_TAG_RE.search(text)
    if not match:
        return text, None
    clean_text = _EMOTION_TAG_RE.sub('', text).strip()
    emotion = match.group(1).lower()
    return clean_text, emotion if emotion in _MINIMAX_EMOTIONS else None


def clean_voice_tags(text: str) -> str:
    """Убирает теги озвучки ([emotion: x], <#1.5#>, (sighs)) — для Whisper-синхронизации, где тегов быть не должно."""
    text = _EMOTION_TAG_RE.sub('', text)
    text = re.sub(r'<#[\d.]+#>', '', text)
    text = re.sub(r'\([a-z][a-z-]*\)', ' ', text)
    return text

class BaseTTSProvider(ABC):
    @abstractmethod
    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        pass

class LocalMockTTSProvider(BaseTTSProvider):
    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        await asyncio.sleep(2.0)
        sample_rate = 24000
        duration = kwargs.get("duration", 0.0)
        dur = duration if duration > 0 else max(len(text) * 0.08, 1.0)
        num_samples = int(dur * sample_rate)
        output_path = kwargs.get("output_path", "")
        if output_path:
            with wave.open(output_path, 'w') as wav_file:
                wav_file.setnchannels(1)
                wav_file.setsampwidth(2)
                wav_file.setframerate(sample_rate)
                wav_file.writeframes(struct.pack('h', 0) * num_samples)

class OmniVoiceProvider(BaseTTSProvider):
    _model = None
    _thread_pool = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    _VOICE_MAP = {
        "aria": "female, young adult, moderate pitch",
        "marcus": "male, middle-aged, low pitch",
        "nova": "female, young adult, high pitch",
    }

    @classmethod
    def unload_model(cls):
        if cls._model is not None:
            del cls._model
            cls._model = None
            import gc, torch
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    @classmethod
    def _load_model(cls):
        import torch
        from omnivoice import OmniVoice
        logging.getLogger('omnivoice').setLevel(logging.INFO)
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        local_path = os.path.join(os.path.dirname(__file__), "..", "..", "ai-models", "OmniVoice")
        local_path = os.path.normpath(local_path)
        checkpoint = local_path if os.path.exists(local_path) else "k2-fsa/OmniVoice"
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float16 if device == "cuda" else torch.float32
        return OmniVoice.from_pretrained(
            checkpoint,
            device_map=device,
            dtype=dtype,
            load_asr=True,
            token=False,
        )

    @classmethod
    def _get_model(cls):
        if cls._model is None:
            try:
                cls._model = cls._load_model()
            except Exception as e:
                import traceback
                traceback.print_exc()
                # Больше никакого тихого MOCK. Выбрасываем понятную ошибку.
                raise RuntimeError(f"Сбой инициализации модели OmniVoice: {e}")
        return cls._model

    # ponytail: **kwargs absorbs all signature changes silently, no unexpected arguments ever again.
    async def generate_tts(self, text: str, voice_model: str, **kwargs) -> None:
        model = self._get_model()

        from omnivoice import OmniVoiceGenerationConfig
        
        num_steps = kwargs.get("num_steps", 32)
        guidance_scale = kwargs.get("guidance_scale", 3.0)
        speed = kwargs.get("speed", 1.0)
        duration = kwargs.get("duration", 0.0)
        denoise = kwargs.get("denoise", True)
        preprocess_prompt = kwargs.get("preprocess_prompt", True)
        postprocess_output = kwargs.get("postprocess_output", True)
        
        gen_config = OmniVoiceGenerationConfig(
            num_step=num_steps,
            guidance_scale=guidance_scale,
            denoise=denoise,
            preprocess_prompt=preprocess_prompt,
            postprocess_output=postprocess_output,
        )

        gen_kwargs = dict(
            text=text.strip(),
            generation_config=gen_config,
        )
        if speed != 1.0:
            gen_kwargs["speed"] = speed
        if duration > 0.0:
            gen_kwargs["duration"] = duration

        if voice_model == "clone":
            ref_audio_path = kwargs.get("ref_audio_path")
            if not ref_audio_path:
                raise ValueError("Для клонирования требуется референсное аудио.")
            gen_kwargs["voice_clone_prompt"] = model.create_voice_clone_prompt(
                ref_audio=ref_audio_path,
                ref_text=kwargs.get("ref_text") or None,
            )
        else:
            gen_kwargs["instruct"] = self._VOICE_MAP.get(voice_model, f"{voice_model}")

        loop = asyncio.get_event_loop()
        audio_list = await loop.run_in_executor(
            self._thread_pool, lambda: model.generate(**gen_kwargs)
        )
        waveform = audio_list[0].squeeze()
        if hasattr(waveform, 'numpy'):
            waveform = waveform.numpy()
        waveform_int16 = (waveform * 32767).astype(np.int16)

        output_path = kwargs.get("output_path", "")
        if output_path:
            with wave.open(output_path, "w") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(model.sampling_rate if hasattr(model, 'sampling_rate') else 24000)
                wav.writeframes(waveform_int16.tobytes())

class SileroProvider(BaseTTSProvider):
    _model = None
    @classmethod
    def _get_model(cls):
        if cls._model is None:
            import torch
            cls._model = torch.hub.load(repo_or_dir='snakers4/silero-models', model='silero_tts', language='ru', speaker='v4_ru')
        return cls._model

    async def generate_tts(self, text: str, voice_model: str, **kwargs):
        import torch
        model = self._get_model()
        sample_rate = 48000
        speaker = 'kseniya' if voice_model in ('', 'aria') else voice_model
        audio = model.apply_tts(text=text, speaker=speaker, sample_rate=sample_rate)
        if audio.dim() == 1:
            audio = audio.unsqueeze(0)
        output_path = kwargs.get("output_path", "")
        if output_path:
            import torchaudio
            torchaudio.save(output_path, audio, sample_rate)

class ElevenLabsProvider(BaseTTSProvider):
    async def generate_tts(self, text: str, voice_model: str, **kwargs):
        api_keys = kwargs.get("api_keys") or {}
        api_key = api_keys.get('elevenlabs', os.environ.get('ELEVENLABS_API_KEY', ''))
        voice_id = voice_model or '21m00Tcm4TlvDq8ikWAM'
        url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
        async with httpx.AsyncClient() as client:
            res = await client.post(url, headers={"xi-api-key": api_key}, json={"text": text, "model_id": "eleven_monolingual_v1", "voice_settings": {"stability": 0.5, "similarity_boost": 0.5}}, timeout=60.0)
            if res.status_code != 200:
                raise RuntimeError(f"ElevenLabs API error: {res.status_code}")
            output_path = kwargs.get("output_path", "")
            if output_path:
                with open(output_path, 'wb') as f:
                    f.write(res.content)

class OpenAIProvider(BaseTTSProvider):
    async def generate_tts(self, text: str, voice_model: str, **kwargs):
        api_keys = kwargs.get("api_keys") or {}
        api_key = api_keys.get('openai', os.environ.get('OPENAI_API_KEY', ''))
        voice = voice_model or 'nova'
        async with httpx.AsyncClient() as client:
            res = await client.post("https://api.openai.com/v1/audio/speech", headers={"Authorization": f"Bearer {api_key}"}, json={"model": "tts-1", "input": text, "voice": voice, "response_format": "wav"}, timeout=60.0)
            if res.status_code != 200:
                raise RuntimeError(f"OpenAI TTS API error: {res.status_code}")
            output_path = kwargs.get("output_path", "")
            if output_path:
                with open(output_path, 'wb') as f:
                    f.write(res.content)

def _gateway_prep(text: str, voice: str, is_minimax: bool, kwargs: dict):
    """Готовит (text, voice, extra_body) для OpenAI-совместимого шлюза.
    Локальные спикеры маплятся на голос провайдера; для minimax выкусывается [emotion: x]
    и уезжает в voice_setting, который шлюз прокидывает в MiniMax нативно."""
    if voice in _LOCAL_SPEAKERS:
        voice = MINIMAX_DEFAULT_VOICE if is_minimax else "nova"
    extra = {}
    if is_minimax:
        text, emotion = split_emotion_tag(text)
        extra["voice_setting"] = {
            "speed": float(kwargs.get("speed", 1.0)),
            "pitch": int(kwargs.get("pitch", 0)),
        }
        if emotion:
            extra["voice_setting"]["emotion"] = emotion
    return text, voice, extra

class GatewayTTSProvider(BaseTTSProvider):
    """TTS через OpenAI-совместимый маршрут: RouterAI — основной, AITUNNEL — резерв.
    Модель задаётся в UI как 'provider/model' (например minimax/speech-2.8-hd).
    Для minimax/* нативные параметры (emotion, speed, pitch) уходят в extra_body.voice_setting."""

    def __init__(self, model: str):
        self.model = model

    async def generate_tts(self, text: str, voice_model: str, **kwargs):
        api_keys = kwargs.get("api_keys") or {}
        if voice_model == 'clone':
            raise RuntimeError("Клонирование голоса доступно только в локальном режиме (OmniVoice) — переключите режим на «Локально»")
        is_minimax = self.model.lower().startswith("minimax/")
        text, voice, extra_body = _gateway_prep(text, voice_model or 'nova', is_minimax, kwargs)

        from openai import AsyncOpenAI
        routes = [
            (api_keys.get('routerai') or os.environ.get('ROUTERAI_API_KEY', ''), 'https://routerai.ru/api/v1', 'RouterAI'),
            (api_keys.get('aitunnel') or os.environ.get('AITUNNEL_API_KEY', ''), 'https://api.aitunnel.ru/v1/', 'AITUNNEL'),
        ]
        last_error = None
        for api_key, base, name in routes:
            if not api_key:
                continue
            try:
                client = AsyncOpenAI(api_key=api_key, base_url=base)
                # AITUNNEL использует нативные id без префикса провайдера: minimax/speech-2.8-hd -> speech-2.8-hd
                model = self.model.split("/", 1)[-1] if name == 'AITUNNEL' else self.model
                response = await client.audio.speech.create(
                    model=model,
                    voice=voice,
                    input=text,
                    response_format="wav",
                    extra_body=extra_body or None,
                )
                output_path = kwargs.get("output_path", "")
                if output_path:
                    with open(output_path, 'wb') as f:
                        f.write(response.content)
                return
            except Exception as exc:
                print(f"[WARN] {name} TTS error: {exc}. Переключение на следующий шлюз...")
                last_error = exc
        raise RuntimeError(f"Gateway TTS недоступен: {last_error or 'ключи не заданы'}")

class TTSProviderFactory:
    @staticmethod
    def get_provider(engine: Optional[str]) -> BaseTTSProvider:
        if engine in ("silero", "snakers4/silero-models"):
            return SileroProvider()
        elif engine == "elevenlabs":
            return ElevenLabsProvider()
        elif engine == "openai":
            return OpenAIProvider()
        elif engine == "k2-fsa/OmniVoice":
            return OmniVoiceProvider()
        elif engine and "/" in engine:
            return GatewayTTSProvider(engine)
        return OmniVoiceProvider()

try:
    import torch
    if torch.cuda.is_available():
        OmniVoiceProvider._get_model()
except Exception:
    pass

if __name__ == "__main__":
    import asyncio

    # pure-logic checks (без сети): маршрутизация движков, замена локальных спикеров, парсинг тегов озвучки
    async def _check():
        factory = TTSProviderFactory
        assert isinstance(factory.get_provider("k2-fsa/OmniVoice"), OmniVoiceProvider)
        assert isinstance(factory.get_provider("snakers4/silero-models"), SileroProvider)
        assert isinstance(factory.get_provider("openai/tts-1-hd"), GatewayTTSProvider)
        assert isinstance(factory.get_provider("minimax/speech-2.8-hd"), GatewayTTSProvider)
        mm = factory.get_provider("minimax/speech-2.8-hd")
        assert mm.model == "minimax/speech-2.8-hd"
        assert factory.get_provider("openai") is not None
        # emotion-тег вырезается и валидируется; whisper на 2.8 не поддержан -> auto
        t, e = split_emotion_tag("  [emotion: angry] Какого черта это упало? ")
        assert (t, e) == ("Какого черта это упало?", "angry")
        t, e = split_emotion_tag("Стало страшно? <#1.5#> (sighs) [emotion: whisper] скорее нет")
        assert e is None and "[emotion" not in t
        assert clean_voice_tags("[emotion: calm] Я жду <#1.5#> (sighs) ответа.").lower().split() == ["я", "жду", "ответа."]
        # шлюз: minimax получает очищенный текст + voice_setting.emotion в extra_body
        t, v, extra = _gateway_prep("[emotion: sad] База исчезла.", "aria", True, {})
        assert v == MINIMAX_DEFAULT_VOICE and extra["voice_setting"]["emotion"] == "sad" and "[emotion" not in t
        t, v, extra = _gateway_prep("[emotion: sad] Ок.", "marcus", False, {})
        assert v == "nova" and extra == {}
        # clone/локальные спикеры в облаке запрещены, без ключей — понятная ошибка
        gw = GatewayTTSProvider("minimax/speech-2.8-hd")
        assert gw.model.split("/", 1)[-1] == "speech-2.8-hd"  # AITUNNEL без префикса провайдера
        try:
            await gw.generate_tts("тест", "aria", api_keys={})
            raise AssertionError("aria должен был смапиться и упасть на отсутствии ключа")
        except RuntimeError as e:
            assert "не задан" in str(e) or "Переключите" in str(e), str(e)
        try:
            await gw.generate_tts("тест", "clone", api_keys={"routerai": "x"})
            raise AssertionError("clone должен был быть запрещён")
        except RuntimeError as e:
            assert "только в локальном режиме" in str(e)
        print("audio_provider gateway mapping OK")

    asyncio.run(_check())
