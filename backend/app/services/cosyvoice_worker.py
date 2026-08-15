"""CosyVoice3 generation worker, run inside backend/venv-cosyvoice.

CosyVoice3 pins transformers==4.51.3, which conflicts with OmniVoice's
transformers>=5.3.0 in the main venv (transformers 5.x breaks CosyVoice3's
incremental KV-cache decoding -> garbage audio). So CosyVoice runs in its own
venv as a persistent subprocess: one JSON job per line on stdin, one JSON
result per line on stdout. Model loads once, jobs stream in.

Usage: venv-cosyvoice\\Scripts\\python.exe cosyvoice_worker.py
Job:  {"text":..., "design_prompt":..., "ref_audio_path":..., "speed":..., "output_path":...}
Job:  {"shutdown": true}
"""
import json
import os
import sys
import re
import traceback
import gc

_CODE_DIR = None

def _paths():
    global _CODE_DIR
    base = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", ".."))
    code = os.path.join(base, "ai-models", "CosyVoice")
    weights = os.path.join(base, "ai-models", "Fun-CosyVoice3-0.5B")
    stubs = os.path.join(base, "ai-models", "stubs")
    matcha = os.path.join(code, "third_party", "Matcha-TTS")
    _CODE_DIR = code
    return base, code, weights, stubs, matcha

def _instruct(prompt: str) -> str:
    p = (prompt or "").strip()
    p = re.sub(r'<\|endofprompt\|>', '', p).strip()
    p = re.sub(r'\[instruct:\s*(.+?)\]', r'\1', p, flags=re.IGNORECASE).strip()
    if not p:
        p = "You are a helpful assistant."
    return f"You are a helpful assistant. {p}<|endofprompt|>"

def _clean_tts_text(text: str) -> str:
    if not text:
        return ""
    # Вырезаем абсолютно любые теги [instruct:...], [emotion:...], ремарки и таймкоды
    t = re.sub(r'\*\([\s\S]*?\)\*', ' ', text)
    t = re.sub(r'\[(?:instruct|emotion):\s*[^\]]+\]', ' ', t, flags=re.IGNORECASE)
    t = re.sub(r'<#[0-9.]+#>', ' ', t)
    t = re.sub(r'\((?:breath|inhale|exhale|sighs|chuckle|laughs|clear-throat|emm|coughs|groans|gasps|sniffs)\)', ' ', t, flags=re.IGNORECASE)
    t = re.sub(r'\s+', ' ', t).strip()
    return t

def main():
    _, code, weights, stubs, matcha = _paths()
    for p in (stubs, code, matcha):
        if os.path.isdir(p) and p not in sys.path:
            sys.path.insert(0, p)
    import torch
    from cosyvoice.cli.cosyvoice import AutoModel

    if not os.path.isdir(weights):
        raise RuntimeError(f"CosyVoice3 weights not found: {weights}")
    print(f"[CosyVoice] worker: loading model from {weights}", flush=True)
    model = AutoModel(model_dir=weights)
    
    # Каст для совместимости типов в Qwen2
    model.model.llm.llm.model.to(torch.float32)
    print("READY", flush=True)
    
    asset = os.path.join(code, "asset", "zero_shot_prompt.wav")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            job = json.loads(line)
            if job.get("shutdown"):
                break
                
            voice_model = job.get("voice_model", "aria")
            ref = job.get("ref_audio_path")
            has_valid_ref = bool(ref and os.path.exists(ref))
            prompt_wav = ref if has_valid_ref else asset
            ref_text = (job.get("ref_text") or "").strip()
            speed = float(job.get("speed", 1.0))
            
            tts_text = _clean_tts_text(job.get("text", ""))
            if not tts_text:
                raise RuntimeError("Текст для озвучки пуст после очистки тегов.")

            with torch.inference_mode():
                # 1. Режим клонирования по аудио (zero-shot не зачитывает промпт)
                if voice_model == "clone" and has_valid_ref:
                    if ref_text:
                        zero_prompt = f"You are a helpful assistant.<|endofprompt|>{ref_text}"
                        gen = model.inference_zero_shot(tts_text, zero_prompt, prompt_wav, stream=False, speed=speed)
                    else:
                        gen = model.inference_cross_lingual(tts_text, prompt_wav, stream=False, speed=speed)
                # 2. Режим дизайна голоса (Instruct)
                else:
                    instruct_prompt = _instruct(job.get("design_prompt"))
                    gen = model.inference_instruct2(tts_text, instruct_prompt, prompt_wav, stream=False, speed=speed)
                
                chunks = [o["tts_speech"] for o in gen]
                
            if not chunks:
                raise RuntimeError("CosyVoice вернул пустой аудио поток.")
                
            audio = torch.cat(chunks, dim=1).squeeze(0)
            if audio.dim() == 1:
                audio = audio.unsqueeze(0)
                
            import torchaudio
            out = job["output_path"]
            os.makedirs(os.path.dirname(out), exist_ok=True)
            audio_int16 = (audio.clamp(-1, 1) * 32767).to(torch.int16)
            torchaudio.save(out, audio_int16, model.sample_rate)
            
            del gen, chunks, audio, audio_int16
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()

            print(json.dumps({"ok": True, "path": out}), flush=True)
        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
            gc.collect()
            print(json.dumps({"error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
