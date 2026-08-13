import sys
import torch
import soundfile as sf

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from qwen_tts import Qwen3TTSModel

print("loading Qwen3-TTS (GPU)...", flush=True)
model = Qwen3TTSModel.from_pretrained(
    "ai-models/Qwen3-TTS-VoiceDesign",
    device_map="cuda:0",
    dtype=torch.bfloat16,
    attn_implementation="sdpa",
)
print("generating (voice design)...", flush=True)
wavs, sr = model.generate_voice_design(
    text="Привет! Это проверка русской озвучки.",
    language="Russian",
    instruct="Мужской голос, спокойный и уверенный.",
)
sf.write("test_qwen.wav", wavs[0], sr)
print(f"OK sr={sr} samples={len(wavs[0])}", flush=True)
