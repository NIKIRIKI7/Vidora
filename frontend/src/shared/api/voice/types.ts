// Простое и понятное разграничение среды
export type VoiceMode = 'local' | 'cloud'

export type AlignmentEngineType = 'Whisper' | 'NativeTts' | 'Passthrough'

export type SpeakerSourceType = 'BuiltIn' | 'Designed' | 'Cloned'

export type ModelDownloadStatus = 'NotDownloaded' | 'Downloading' | 'Ready' | 'Failed'

export interface AiModelDto {
  id: string
  name: string
  category: 'Stt' | 'Tts' | 'Llm' | 'Chromium' | 'Vision'
  target_directory: string
  expected_size_mb: number
  downloaded_size_mb: number
  status: ModelDownloadStatus
  error_message?: string | null
  version: string
  is_required: boolean
}

export interface SpeakerProfileDto {
  id: string
  speaker_id: string
  name: string
  description?: string | null
  source_type: SpeakerSourceType
  mode: VoiceMode                    // Строго 'local' | 'cloud'
  backend_engine?: string            // Технический идентификатор бэкенда
  language: string
  gender?: string | null
  is_default: boolean
  is_active: boolean
  preview_audio_path?: string | null
}

export interface TimedWord {
  word: string
  start_ms: number
  end_ms: number
  confidence: number
}

export interface VoiceJobDto {
  id: string
  text: string
  status: 'Queued' | 'Synthesizing' | 'Aligning' | 'ProcessingAudio' | 'Ready' | 'Failed'
  mode: VoiceMode                    // Строго 'local' | 'cloud'
  speaker_id: string
  audio_path?: string | null
  media_asset_id?: string | null
  duration_seconds?: number | null
  alignment_engine: string
  words: TimedWord[]
  error?: string | null
}

export interface DesignSpeakerPayload {
  name: string
  engine: string                 // VoiceEngineType: 'LocalTts' (дизайн всегда локальный)
  prompt: string                 // Свободный текстовый промпт (ACL — на стороне воркера)
  local_engine_id?: string       // id локальной модели из /engines (например omni_voice_v1)
}

export interface SynthesizePayload {
  text: string
  speaker_id: string
  mode?: VoiceMode                   // Опционально (бэкенд резолвит движок из профиля диктора)
  speed?: number
  pitch?: number
  guidance_scale?: number            // CFG 1.0..10.0 (по умолчанию 3.0)
  num_steps?: number                 // Шаги диффузии 8..128 (по умолчанию 32)
  denoise?: boolean                  // Advanced: prepend <|denoise|> (по умолчанию true)
  duration?: number                  // Advanced: фиксированная длительность, 0 = auto
  preprocess_prompt?: boolean        // Advanced
  postprocess_output?: boolean       // Advanced
  alignment_engine?: AlignmentEngineType
  reference_audio_path?: string | null
  backend_engine?: string            // EngineOverride — если не указан, бэкенд решит сам
}

export interface VoiceEngineInfoDto {
  id: string
  name: string
  mode: VoiceMode
  capabilities: string[]
  supports_clone: boolean
  supports_design: boolean
  supports_synthesis: boolean
  is_available: boolean
  status_message?: string | null
  description: string
}