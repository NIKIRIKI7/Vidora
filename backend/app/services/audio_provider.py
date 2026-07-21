import os
import wave
import struct
import asyncio
import concurrent.futures
import logging
from abc import ABC, abstractmethod

import numpy as np

class BaseTTSProvider(ABC):
    @abstractmethod
    async def generate_tts(
        self,
        text: str,
        voice_model: str,
        stability: float,
        clarity: float,
        output_path: str,
        ref_audio_path: str = None,
        ref_text: str = None,
    ) -> None:
        pass

class LocalMockTTSProvider(BaseTTSProvider):
    """Резервная заглушка, если нейросеть не запустилась (чтобы не крашить сервер)"""
    async def generate_tts(
        self,
        text: str,
        voice_model: str,
        stability: float,
        clarity: float,
        output_path: str,
        ref_audio_path: str = None,
        ref_text: str = None,
    ) -> None:
        await asyncio.sleep(2.0)
        duration = max(len(text) * 0.08, 1.0)
        sample_rate = 24000
        num_samples = int(duration * sample_rate)
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

        print(f"[OmniVoice] Loading model from {checkpoint} (device={device}) ...")

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
                print(f"\n[OmniVoice] Ошибка загрузки модели (WinError 127 обычно означает сбой torchaudio/DLL): {e}")
                print("[OmniVoice] Включаем заглушку (Mock TTS), чтобы вы могли продолжить работу.\n")
                cls._model = "MOCK"
        return cls._model

    async def generate_tts(
        self,
        text: str,
        voice_model: str,
        stability: float,
        clarity: float,
        output_path: str,
        ref_audio_path: str = None,
        ref_text: str = None,
    ) -> None:
        model = self._get_model()

        if model == "MOCK":
            await LocalMockTTSProvider().generate_tts(text, voice_model, stability, clarity, output_path)
            return

        from omnivoice import OmniVoiceGenerationConfig

        guidance_scale = 1.0 + (1.0 - max(0.0, min(1.0, stability))) * 2.0
        num_step = max(8, int(max(0.0, min(1.0, clarity)) * 64))

        gen_config = OmniVoiceGenerationConfig(
            num_step=num_step,
            guidance_scale=guidance_scale,
            denoise=True,
            preprocess_prompt=True,
            postprocess_output=True,
        )

        kwargs = dict(
            text=text.strip(),
            generation_config=gen_config,
        )

        if voice_model == "clone":
            if not ref_audio_path:
                raise ValueError("Для клонирования требуется референсное аудио.")

            kwargs["voice_clone_prompt"] = model.create_voice_clone_prompt(
                ref_audio=ref_audio_path,
                ref_text=ref_text or None,
            )
        else:
            kwargs["instruct"] = self._VOICE_MAP.get(voice_model, f"{voice_model}")

        loop = asyncio.get_event_loop()
        audio_list = await loop.run_in_executor(
            self._thread_pool, lambda: model.generate(**kwargs)
        )

        waveform = audio_list[0].squeeze()
        if hasattr(waveform, 'numpy'):
            waveform = waveform.numpy()

        waveform_int16 = (waveform * 32767).astype(np.int16)

        with wave.open(output_path, "w") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(model.sampling_rate if hasattr(model, 'sampling_rate') else 24000)
            wav.writeframes(waveform_int16.tobytes())

# Инициализация при старте сервера
try:
    import torch
    if torch.cuda.is_available():
        OmniVoiceProvider._get_model()
except Exception:
    pass
