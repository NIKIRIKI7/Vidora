import { API } from '@shared/lib'

export type SkillStage =
  | 'scene_generation'
  | 'widget_creation'
  | 'project'
  | 'fragment'
  | 'tts'
  | 'script_drafting'
  | 'hook_analysis'
  | 'general'

export interface SkillItem {
  id: string
  name: string
  description: string
  prompt: string
  stage: SkillStage
  is_active: boolean
  is_custom: boolean
  priority: number
  version: number
  created_at: string
  updated_at: string
}

export interface SkillCreate {
  name: string
  description?: string
  prompt: string
  stage: SkillStage
  priority?: number
}

export interface SkillUpdate {
  name?: string
  description?: string
  prompt?: string
  stage?: SkillStage
  is_active?: boolean
  priority?: number
}

const API_BASE = `${API}/api/v1/skills`
const SYSTEM_BASE = `${API}/api/v1/system/skills`

export const skillsApi = {
  async getAll(stage?: SkillStage, isActive?: boolean): Promise<SkillItem[]> {
    const params = new URLSearchParams()
    if (stage) params.append('stage', stage)
    if (isActive !== undefined) params.append('is_active', String(isActive))
    const qs = params.toString()
    const res = await fetch(qs ? `${API_BASE}?${qs}` : API_BASE)
    if (!res.ok) throw new Error(`Ошибка загрузки скилов: ${res.statusText}`)
    return res.json()
  },

  async getById(id: string): Promise<SkillItem> {
    const res = await fetch(`${API_BASE}/${id}`)
    if (!res.ok) throw new Error(`Скил не найден: ${id}`)
    return res.json()
  },

  async create(data: SkillCreate): Promise<SkillItem> {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Ошибка создания скила')
    return res.json()
  },

  async update(id: string, data: SkillUpdate): Promise<SkillItem> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`Ошибка обновления скила ${id}`)
    return res.json()
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Ошибка удаления скила ${id}`)
  },

  async resetSkill(id: string): Promise<SkillItem> {
    const res = await fetch(`${SYSTEM_BASE}/${id}/reset`, { method: 'POST' })
    if (!res.ok) throw new Error(`Ошибка сброса скила ${id}`)
    return res.json()
  },
}
