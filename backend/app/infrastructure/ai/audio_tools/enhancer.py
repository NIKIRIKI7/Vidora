"""Апскейлер частоты дискретизации и качества речи LavaSR."""

import gc
import os
from pathlib import Path
from typing import Optional

import soundfile as sf
import torch
import torchaudio


class LavaSREnhancer:
    _model = None
    _device = None

    @classmethod
    def get_model(cls, device: Optional[str] = None):
        if cls._model is None:
            try:
                from LavaSR.model import LavaEnhance2
            except ImportError:
                return None
            cls._device = device or ("cuda" if torch.cuda.is_available() else "cpu")
            try:
                cls._model = LavaEnhance2("YatharthS/LavaSR", device=cls._device)
            except Exception:
                cls._model = None
                return None
        return cls._model

    @classmethod
    def unload_model(cls) -> None:
        if cls._model is not None:
            del cls._model
            cls._model = None
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    @classmethod
    def enhance_file(
            cls,
            input_path: Path | str,
            output_path: Optional[Path | str] = None,
            enhance: bool = True,
            denoise: bool = False,
            batch: Optional[bool] = None,
    ) -> Path:
        in_p = Path(input_path)
        out_p = Path(output_path or input_path)
        if not in_p.exists():
            return in_p

        model = cls.get_model()
        if model is None:
            return in_p

        temp_out = out_p.with_suffix(".lavasr.tmp.wav")
        try:
            audio, sr = model.load_audio(str(in_p), duration=10000, cutoff=None)
            dur_sec = len(audio) / float(sr or 16000)
            use_batch = batch if batch is not None else (dur_sec > 45.0)

            with torch.inference_mode():
                out = model.enhance(audio, enhance=enhance, denoise=denoise, batch=use_batch)

            temp_out.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(out, torch.Tensor):
                out_tensor = out.detach().cpu()
                if out_tensor.dim() == 1:
                    out_tensor = out_tensor.unsqueeze(0)
                out_tensor = (out_tensor.clamp(-1, 1) * 32767).to(torch.int16)
                torchaudio.save(str(temp_out), out_tensor, 48000)
            else:
                import numpy as np

                out_np = np.asarray(out, dtype=np.float32).squeeze()
                out_np = (np.clip(out_np, -1, 1) * 32767).astype(np.int16)
                sf.write(str(temp_out), out_np, 48000)

            if temp_out.exists() and temp_out.stat().st_size > 1000:
                os.replace(str(temp_out), str(out_p))
                return out_p
            return in_p
        except Exception:
            if temp_out.exists():
                temp_out.unlink(missing_ok=True)
            return in_p
