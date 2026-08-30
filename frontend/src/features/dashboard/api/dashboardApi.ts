import { API } from '@shared/lib'
import type { GlobalSettings, HardwareInfo, ProjectCreatePayload, ProjectItem } from '../types'

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

  getSavedProjects(): ProjectItem[] {
    const saved = localStorage.getItem('vidora_projects_meta')
    if (saved) {
      try {
        return JSON.parse(saved) as ProjectItem[]
      } catch {
        // fallback ниже
      }
    }
    const defaults: ProjectItem[] = [
      {
        id: 'tech-review-2026',
        name: 'Tech Review 2026',
        format: '16:9',
        scene_count: 5,
        duration_sec: 184,
        updated_at: new Date(Date.now() - 3600000 * 2).toISOString(),
        has_audio: true,
        status: 'audio_ready',
      },
      {
        id: 'ai-agents-breakdown',
        name: 'AI Agents Breakdown',
        format: '9:16',
        scene_count: 8,
        duration_sec: 58,
        updated_at: new Date(Date.now() - 3600000 * 18).toISOString(),
        has_audio: true,
        status: 'rendered',
      },
      {
        id: 'local-llm-guide',
        name: 'Local LLM Guide',
        format: '16:9',
        scene_count: 3,
        duration_sec: 92,
        updated_at: new Date(Date.now() - 3600000 * 48).toISOString(),
        has_audio: false,
        status: 'draft',
      },
    ]
    localStorage.setItem('vidora_projects_meta', JSON.stringify(defaults))
    return defaults
  },

  saveProjects(projects: ProjectItem[]): void {
    localStorage.setItem('vidora_projects_meta', JSON.stringify(projects))
  },

  createProject(payload: ProjectCreatePayload): ProjectItem {
    const projects = this.getSavedProjects()
    const newProj: ProjectItem = {
      id: payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `proj-${Date.now()}`,
      name: payload.name.trim(),
      format: payload.format,
      scene_count: 1,
      duration_sec: 30,
      updated_at: new Date().toISOString(),
      has_audio: false,
      status: 'draft',
    }
    const updated = [newProj, ...projects]
    this.saveProjects(updated)
    return newProj
  },

  deleteProject(id: string): void {
    const projects = this.getSavedProjects().filter((p) => p.id !== id)
    this.saveProjects(projects)
  },

  getSettings(): GlobalSettings {
    const saved = localStorage.getItem('vidora_global_settings')
    if (saved) {
      try {
        return JSON.parse(saved) as GlobalSettings
      } catch {
        // fallback ниже
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
