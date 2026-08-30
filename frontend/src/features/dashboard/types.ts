export interface HardwareInfo {
  vram_gb: number
  ram_gb: number
  device: string
  gpu_type: 'cuda' | 'cpu'
}

export interface ProjectItem {
  id: string
  name: string
  format: '16:9' | '9:16'
  scene_count: number
  duration_sec: number
  updated_at: string
  thumbnail_url?: string
  has_audio: boolean
  status: 'draft' | 'audio_ready' | 'rendered'
}

export interface ProjectCreatePayload {
  name: string
  format: '16:9' | '9:16'
  fps: number
  animationStyle: string
  colors: {
    primary: string
    secondary: string
    background: string
    surface: string
    accent: string
    text: string
  }
}

export interface GlobalSettings {
  routerai_api_key: string
  aitunnel_api_key: string
  openai_api_key: string
  anthropic_api_key: string
  elevenlabs_api_key: string
  pexels_api_key: string
  youtube_api_key: string
  whisper_model: string
  ollama_url: string
  gpu_layers: number
}
