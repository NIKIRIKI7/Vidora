import gc
import json
import sys
import traceback
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[3]
_loaded_models = {}


def get_qwen_model(model_id: str, device: str):
    key = f"qwen_{model_id}_{device}"
    if key in _loaded_models:
        return _loaded_models[key]
    import torch
    from qwen_tts import Qwen3TTSModel

    on_cuda = device.startswith("cuda")
    model = Qwen3TTSModel.from_pretrained(
        model_id,
        device_map=device,
        dtype=torch.bfloat16 if on_cuda else torch.float32,
        attn_implementation="sdpa" if on_cuda else "eager",
    )
    _loaded_models[key] = model
    return model


def get_moss_model(model_id: str, codec_path: str, device: str):
    key = f"moss_{model_id}_{device}"
    if key in _loaded_models:
        return _loaded_models[key]
    import torch
    from transformers import AutoModel, AutoProcessor

    on_cuda = device.startswith("cuda")
    processor = AutoProcessor.from_pretrained(model_id, trust_remote_code=True, codec_path=codec_path)
    processor.audio_tokenizer = processor.audio_tokenizer.to(device)
    model = AutoModel.from_pretrained(
        model_id,
        trust_remote_code=True,
        attn_implementation="sdpa" if on_cuda else "eager",
        torch_dtype=torch.bfloat16 if on_cuda else torch.float32,
    ).to(device)
    model.eval()
    _loaded_models[key] = (processor, model)
    return processor, model


def process_job(job: dict):
    import torch
    import soundfile as sf

    engine = job.get("engine", "qwen")
    model_id = job.get("model_id")
    mode = job.get("mode", "design")
    text = job.get("text", "")
    language = job.get("language", "Russian")
    output_path = job.get("output")
    speaker = job.get("speaker", "Vivian")
    design_prompt = job.get("design_prompt", "")
    ref_audio = job.get("ref_audio", "")
    ref_text = job.get("ref_text", "")
    codec_path = job.get("codec_path", "")
    device_arg = job.get("device", "auto")
    device = device_arg if device_arg != "auto" else ("cuda:0" if torch.cuda.is_available() else "cpu")

    if engine == "qwen":
        model = get_qwen_model(model_id, device)
        if mode == "design":
            wavs, sr = model.generate_voice_design(text=text, language=language, instruct=design_prompt)
        elif mode == "clone":
            wavs, sr = model.generate_voice_clone(text=text, language=language, ref_audio=ref_audio,
                                                  ref_text=ref_text or None)
        else:
            wavs, sr = model.generate_custom_voice(text=text, language=language, speaker=speaker,
                                                   instruct=design_prompt or None)
        sf.write(output_path, wavs[0], sr)
    else:
        processor, model = get_moss_model(model_id, codec_path, device)
        conversations = [[processor.build_user_message(text=text)]]
        batch = processor(conversations, mode="generation")
        with torch.no_grad():
            outputs = model.generate(input_ids=batch["input_ids"].to(device),
                                     attention_mask=batch["attention_mask"].to(device), max_new_tokens=500)
        for message in processor.decode(outputs):
            audio = message.audio_codes_list[0]
            wav = audio.cpu().numpy()
            if wav.ndim > 1:
                wav = wav.squeeze(0)
            sf.write(output_path, wav, processor.model_config.sampling_rate)
            break

    if torch.cuda.is_available():
        torch.cuda.empty_cache()
    gc.collect()


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    print("READY", flush=True)
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
            if job.get("shutdown"):
                break
            process_job(job)
            print(json.dumps({"ok": True, "path": job.get("output")}), flush=True)
        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            print(json.dumps({"error": str(e)}), flush=True)


if __name__ == "__main__":
    main()
