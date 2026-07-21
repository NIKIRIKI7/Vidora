import os
import wave
from app.schemas import AudioGenerationRequest
from app.services.audio_provider import BaseTTSProvider, OmniVoiceProvider
from app.ws_manager import manager

class AudioService:
    def __init__(self, provider: BaseTTSProvider = None):
        self.provider = provider or OmniVoiceProvider()

    async def generate(self, request: AudioGenerationRequest) -> dict:
        await manager.broadcast({
            "type": "AUDIO_GEN_PROGRESS",
            "payload": {
                "fragment_id": request.fragment_id,
                "status": "processing",
                "percent": 10,
            },
        })

        # Save to assets/voice instead of just voice
        voice_dir = os.path.join(request.project_path, "assets", "voice")
        os.makedirs(voice_dir, exist_ok=True)

        # Format: Scene_1_Frag_2_abcd12.wav
        filename = f"{request.file_prefix}_{request.fragment_id[:6]}.wav"
        output_path = os.path.join(voice_dir, filename)

        await self.provider.generate_tts(
            text=request.text,
            voice_model=request.voice_model,
            guidance_scale=request.guidance_scale,
            num_steps=request.num_steps,
            speed=request.speed,
            duration=request.duration,
            denoise=request.denoise,
            preprocess_prompt=request.preprocess_prompt,
            postprocess_output=request.postprocess_output,
            output_path=output_path,
            ref_audio_path=request.ref_audio_path,
            ref_text=request.ref_text,
        )

        duration = 0.0
        if os.path.exists(output_path):
            with wave.open(output_path, 'r') as wav_file:
                frames = wav_file.getnframes()
                rate = wav_file.getframerate()
                duration = frames / float(rate)

        await manager.broadcast({
            "type": "AUDIO_GEN_PROGRESS",
            "payload": {
                "fragment_id": request.fragment_id,
                "status": "done",
                "percent": 100,
            },
        })

        return {
            "status": "ok",
            "audio_url": filename,
            "absolute_path": os.path.abspath(output_path),
            "duration": round(duration, 3),
        }
