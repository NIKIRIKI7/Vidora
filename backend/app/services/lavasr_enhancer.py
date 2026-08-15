import os
import gc
import torch
import torchaudio
import soundfile as sf
from pathlib import Path
from typing import Optional


class LavaSREnhancer:
    _model = None
    _device = None

    @classmethod
    def get_model(cls, device: Optional[str] = None):
        """Ленивая загрузка модели LavaSR (YatharthS/LavaSR) в VRAM/RAM."""
        if cls._model is None:
            try:
                from LavaSR.model import LavaEnhance2
            except ImportError:
                print(
                    "[LavaSR] Библиотека LavaSR не установлена в .venv.\n"
                    "Для включения 48kHz AI-апскейла выполните:\n"
                    "pip install git+https://github.com/ysharma3501/LavaSR.git"
                )
                return None

            cls._device = device or ("cuda" if torch.cuda.is_available() else "cpu")
            print(f"[LavaSR] Загрузка модели YatharthS/LavaSR на {cls._device}...")
            try:
                cls._model = LavaEnhance2("YatharthS/LavaSR", device=cls._device)
                print("[LavaSR] Модель LavaSR успешно инициализирована (48 кГц BWE + Denoiser)!")
            except Exception as e:
                print(f"[LavaSR] Ошибка инициализации LavaSR: {e}")
                cls._model = None
                return None
        return cls._model

    @classmethod
    def unload_model(cls):
        """Освобождение VRAM от весов LavaSR."""
        if cls._model is not None:
            print("[LavaSR] Выгрузка модели LavaSR из VRAM...")
            del cls._model
            cls._model = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    @classmethod
    def enhance_file(
        cls,
        input_path: str,
        output_path: Optional[str] = None,
        enhance: bool = True,
        denoise: bool = False,
        batch: Optional[bool] = None,
    ) -> str:
        """
        Улучшает аудиофайл через LavaSR:
        - enhance=True: расширение полосы частот (BWE upscaling 8-48 кГц -> 48 кГц).
        - denoise=True: нейросетевое шумоподавление UL-UNAS.
        - batch: автоматический чанкинг для длинных файлов (> 45 с).
        """
        if not os.path.exists(input_path):
            return input_path

        model = cls.get_model()
        if model is None:
            # Fallback: оставляем исходный файл, если библиотека не установлена
            return input_path

        target_out = output_path or input_path
        temp_out = target_out + ".lavasr.tmp.wav"

        try:
            # Загрузка и подготовка аудио
            audio, sr = model.load_audio(input_path, duration=10000, cutoff=None)

            # Авто-батчинг для длинного аудио во избежание всплесков VRAM
            dur_sec = len(audio) / float(sr or 16000)
            use_batch = batch if batch is not None else (dur_sec > 45.0)

            with torch.inference_mode():
                out = model.enhance(
                    audio,
                    enhance=enhance,
                    denoise=denoise,
                    batch=use_batch,
                )

            # Сохраняем в 48 кГц (int16 PCM — его читает wave.getframerate в _get_audio_duration)
            os.makedirs(os.path.dirname(os.path.abspath(target_out)), exist_ok=True)
            if isinstance(out, torch.Tensor):
                out_tensor = out.detach().cpu()
                if out_tensor.dim() == 1:
                    out_tensor = out_tensor.unsqueeze(0)
                out_tensor = (out_tensor.clamp(-1, 1) * 32767).to(torch.int16)
                torchaudio.save(temp_out, out_tensor, 48000)
            else:
                import numpy as np
                out_np = np.asarray(out, dtype=np.float32).squeeze()
                out_np = (np.clip(out_np, -1, 1) * 32767).astype(np.int16)
                sf.write(temp_out, out_np, 48000)

            if os.path.exists(temp_out) and os.path.getsize(temp_out) > 1000:
                os.replace(temp_out, target_out)
                print(f"[LavaSR] Аудио апскейлено до 48 кГц: {target_out}")
                return target_out

            return input_path

        except Exception as e:
            print(f"[LavaSR ERROR] Ошибка обработки файла {input_path}: {e}")
            if os.path.exists(temp_out):
                try:
                    os.remove(temp_out)
                except Exception:
                    pass
            return input_path
