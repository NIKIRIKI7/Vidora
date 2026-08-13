"""Worker для локальных LLM-TTS (Qwen3-TTS / MOSS-TTS).

Запускается из отдельного venv (.venv-qwen / .venv-moss) через subprocess,
т.к. их зависимости (transformers 4.x / 5.0) несовместимы с основным venv.
Генерирует аудио и сохраняет WAV в --output.
"""
import argparse
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser()
    p.add_argument("--engine", required=True, choices=["qwen", "moss"])
    p.add_argument("--model-id", required=True)
    p.add_argument("--mode", default="design", choices=["design", "clone", "custom", "moss"])
    p.add_argument("--text", required=True)
    p.add_argument("--voice-model", default="aria")
    p.add_argument("--speaker", default="Vivian")
    p.add_argument("--language", default="Russian")
    p.add_argument("--output", required=True)
    p.add_argument("--design-prompt", default="")
    p.add_argument("--ref-audio", default="")
    p.add_argument("--ref-text", default="")
    p.add_argument("--codec-path", default="")
    p.add_argument("--device", default="auto")
    a = p.parse_args()

    import torch

    device = a.device if a.device != "auto" else ("cuda:0" if torch.cuda.is_available() else "cpu")
    on_cuda = device.startswith("cuda")

    if a.engine == "qwen":
        import soundfile as sf
        from qwen_tts import Qwen3TTSModel

        model = Qwen3TTSModel.from_pretrained(
            a.model_id,
            device_map=device,
            dtype=torch.bfloat16 if on_cuda else torch.float32,
            attn_implementation="sdpa" if on_cuda else "eager",
        )
        if a.mode == "design":
            wavs, sr = model.generate_voice_design(
                text=a.text, language=a.language, instruct=a.design_prompt
            )
        elif a.mode == "clone":
            wavs, sr = model.generate_voice_clone(
                text=a.text, language=a.language,
                ref_audio=a.ref_audio, ref_text=a.ref_text or None,
            )
        else:  # custom voice
            wavs, sr = model.generate_custom_voice(
                text=a.text, language=a.language,
                speaker=a.speaker, instruct=a.design_prompt or None,
            )
        sf.write(a.output, wavs[0], sr)

    else:  # moss
        import soundfile as sf
        from transformers import AutoModel, AutoProcessor

        # ponytail: MOSS-TTS-Local не влезает в 4 ГБ VRAM — по умолчанию CPU
        if on_cuda:
            torch.backends.cuda.enable_cudnn_sdp(False)
            torch.backends.cuda.enable_flash_sdp(True)
            torch.backends.cuda.enable_mem_efficient_sdp(True)
            torch.backends.cuda.enable_math_sdp(True)

        processor = AutoProcessor.from_pretrained(
            a.model_id, trust_remote_code=True, codec_path=a.codec_path
        )
        processor.audio_tokenizer = processor.audio_tokenizer.to(device)
        model = AutoModel.from_pretrained(
            a.model_id,
            trust_remote_code=True,
            attn_implementation="sdpa" if on_cuda else "eager",
            torch_dtype=torch.bfloat16 if on_cuda else torch.float32,
        ).to(device)
        model.eval()

        conversations = [[processor.build_user_message(text=a.text)]]
        batch = processor(conversations, mode="generation")
        with torch.no_grad():
            outputs = model.generate(
                input_ids=batch["input_ids"].to(device),
                attention_mask=batch["attention_mask"].to(device),
                max_new_tokens=500,
            )
        for message in processor.decode(outputs):
            audio = message.audio_codes_list[0]
            wav = audio.cpu().numpy()
            if wav.ndim > 1:
                wav = wav.squeeze(0)
            sf.write(a.output, wav, processor.model_config.sampling_rate)
            break

    print("OK", flush=True)


if __name__ == "__main__":
    main()
