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
