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
        guidance_scale: float,
        num_steps: int,
        speed: float,
        duration: float,
        denoise: bool,
        preprocess_prompt: bool,
        postprocess_output: bool,
        output_path: str,
        ref_audio_path: str = None,
        ref_text: str = None,
    ) -> None:
        pass

class LocalMockTTSProvider(BaseTTSProvider):
    async def generate_tts(
        self,
        text: str,
        voice_model: str,
        guidance_scale: float = 3.0,
        num_steps: int = 32,
        speed: float = 1.0,
        duration: float = 0.0,
        denoise: bool = True,
        preprocess_prompt: bool = True,
        postprocess_output: bool = True,
        output_path: str = "",
        ref_audio_path: str = None,
        ref_text: str = None,
    ) -> None:
        await asyncio.sleep(2.0)
        sample_rate = 24000
        dur = duration if duration > 0 else max(len(text) * 0.08, 1.0)
        num_samples = int(dur * sample_rate)
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
        guidance_scale: float = 3.0,
        num_steps: int = 32,
        speed: float = 1.0,
        duration: float = 0.0,
        denoise: bool = True,
        preprocess_prompt: bool = True,
        postprocess_output: bool = True,
        output_path: str = "",
        ref_audio_path: str = None,
        ref_text: str = None,
    ) -> None:
        model = self._get_model()

        if model == "MOCK":
            await LocalMockTTSProvider().generate_tts(
                text=text, voice_model=voice_model,
                guidance_scale=guidance_scale, num_steps=num_steps,
                speed=speed, duration=duration,
                denoise=denoise, preprocess_prompt=preprocess_prompt,
                postprocess_output=postprocess_output,
                output_path=output_path,
                ref_audio_path=ref_audio_path, ref_text=ref_text,
            )
            return

        from omnivoice import OmniVoiceGenerationConfig

        gen_config = OmniVoiceGenerationConfig(
            num_step=num_steps,
            guidance_scale=guidance_scale,
            denoise=denoise,
            preprocess_prompt=preprocess_prompt,
            postprocess_output=postprocess_output,
        )

        kwargs = dict(
            text=text.strip(),
            generation_config=gen_config,
        )

        if speed != 1.0:
            kwargs["speed"] = speed
        if duration > 0.0:
            kwargs["duration"] = duration

        if voice_model == "clone":
            if not ref_audio_path:
                raise ValueError("Для клонирования требуется референсное аудио.")

            kwargs["voice_clone_prompt"] = model.create_voice_clone_prompt(
                ref_audio=ref_audio_path,
                ref_text=ref_text or None,
            )
        else:
            kwargs["instruct"] = self._VOICE_MAP.get(voice_model, f"{voice_model}")

        print(f"[OmniVoice] generate: text='{text[:60]}...' config=num_step={num_steps} guidance_scale={guidance_scale} "
              f"speed={speed} duration={duration} denoise={denoise}")

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
