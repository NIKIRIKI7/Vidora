import { API } from '@shared/lib'
import type { GlobalSettings, HardwareInfo } from '../types'

const API_BASE = `${API}/api/v1`

export const dashboardApi = {
  async getHardwareInfo(): Promise<HardwareInfo> {
    try {
      const res = await fetch(`${API_BASE}/system/hardware`)
      if (!res.ok) throw new Error('Не удалось получить данные о железе')
      return await res.json()
    } catch {
      return { vram_gb: 0, ram_gb: 16, device: 'CPU Mode', gpu_type: 'cpu' }
    }
  },

  getSettings(): GlobalSettings {
    const saved = localStorage.getItem('vidora_global_settings')
    if (saved) {
      try {
        return JSON.parse(saved) as GlobalSettings
      } catch {
        // fallback to default
      }
    }
    return {
      routerai_api_key: '',
      aitunnel_api_key: '',
      openai_api_key: '',
      anthropic_api_key: '',
      elevenlabs_api_key: '',
      pexels_api_key: '',
      youtube_api_key: '',
      whisper_model: 'small',
      ollama_url: 'http://127.0.0.1:11434',
      gpu_layers: 33,
    }
  },

  saveSettings(settings: GlobalSettings): void {
    localStorage.setItem('vidora_global_settings', JSON.stringify(settings))
  },
}
