import sys
import torch
import soundfile as sf

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from transformers import AutoModel, AutoProcessor

# ponytail: MOSS-TTS-Local требует ~10 ГБ VRAM (модель + аудио-токенайзер) — на 4 ГБ RTX 3050 OOM.
# GPU-режим: device="cuda", dtype=torch.bfloat16. CPU-режим (этот): float32.
device = "cpu"
dtype = torch.float32

print("loading MOSS-TTS-Local (CPU)...", flush=True)
processor = AutoProcessor.from_pretrained(
    "ai-models/MOSS-TTS-Local-Transformer",
    trust_remote_code=True,
    codec_path="ai-models/MOSS-Audio-Tokenizer",
)
processor.audio_tokenizer = processor.audio_tokenizer.to(device)

text = "Привет, это проверка русской озвучки."

model = AutoModel.from_pretrained(
    "ai-models/MOSS-TTS-Local-Transformer",
    trust_remote_code=True,
    attn_implementation="eager",
    torch_dtype=dtype,
).to(device)
model.eval()

print("generating...", flush=True)
conversations = [[processor.build_user_message(text=text)]]
batch = processor(conversations, mode="generation")
input_ids = batch["input_ids"].to(device)
attention_mask = batch["attention_mask"].to(device)

with torch.no_grad():
    outputs = model.generate(
        input_ids=input_ids, attention_mask=attention_mask, max_new_tokens=500
    )

for message in processor.decode(outputs):
    audio = message.audio_codes_list[0]
    wav = audio.cpu().numpy()
    if wav.ndim > 1:
        wav = wav.squeeze(0)
    sf.write("test_moss.wav", wav, processor.model_config.sampling_rate)
print("OK", flush=True)
