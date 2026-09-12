import { API } from '@shared/lib'

export type SkillStage =
  | 'scene_generation'
  | 'project'
  | 'fragment'
  | 'tts'
  | 'script_drafting'
  | 'hook_analysis'
  | 'broll_matching'
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
    if (isActive !== undefined) params.append('only_enabled', String(isActive))
    const qs = params.toString()
    const res = await fetch(qs ? `${API_BASE}?${qs}` : API_BASE)
    if (!res.ok) throw new Error(`Ошибка загрузки скилов: ${res.statusText}`)
    const data = await res.json()

    return data.map((d: any) => ({
      id: d.id,
      name: d.name,
      description: d.description || '',
      prompt: d.content || d.prompt || '',
      stage: d.stage,
      is_active: d.is_enabled ?? d.is_active ?? true,
      is_custom: !d.is_default,
      priority: d.priority ?? 100,
      version: d.version ?? 1,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }))
  },

  async getById(id: string): Promise<SkillItem> {
    const res = await fetch(`${API_BASE}/${id}`)
    if (!res.ok) throw new Error(`Скил не найден: ${id}`)
    const d = await res.json()
    return {
      id: d.id,
      name: d.name,
      description: d.description || '',
      prompt: d.content || d.prompt || '',
      stage: d.stage,
      is_active: d.is_enabled ?? d.is_active ?? true,
      is_custom: !d.is_default,
      priority: d.priority ?? 100,
      version: d.version ?? 1,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }
  },

  async create(data: SkillCreate): Promise<SkillItem> {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: `skill-${data.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: data.name,
        description: data.description || '',
        content: data.prompt,
        stage: data.stage,
        priority: data.priority ?? 100,
      }),
    })
    if (!res.ok) throw new Error('Ошибка создания скила')
    const d = await res.json()
    return {
      id: d.id,
      name: d.name,
      description: d.description || '',
      prompt: d.content || d.prompt || '',
      stage: d.stage,
      is_active: d.is_enabled ?? true,
      is_custom: true,
      priority: d.priority,
      version: d.version,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }
  },

  async update(id: string, data: SkillUpdate): Promise<SkillItem> {
    const res = await fetch(`${API_BASE}/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: data.name,
        description: data.description,
        content: data.prompt,
        is_enabled: data.is_active,
        priority: data.priority,
      }),
    })
    if (!res.ok) throw new Error(`Ошибка обновления скила ${id}`)
    const d = await res.json()
    return {
      id: d.id,
      name: d.name,
      description: d.description || '',
      prompt: d.content || d.prompt || '',
      stage: d.stage,
      is_active: d.is_enabled ?? true,
      is_custom: !d.is_default,
      priority: d.priority,
      version: d.version,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }
  },

  async delete(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE' })
    if (!res.ok) throw new Error(`Ошибка удаления скила ${id}`)
  },

  async resetSkill(id: string): Promise<SkillItem> {
    const res = await fetch(`${SYSTEM_BASE}/${id}/reset`, { method: 'POST' })
    if (!res.ok) throw new Error(`Ошибка сброса скила ${id}`)
    const d = await res.json()
    return {
      id: d.id,
      name: d.name,
      description: d.description || '',
      prompt: d.content || d.prompt || '',
      stage: d.stage,
      is_active: d.is_enabled ?? true,
      is_custom: false,
      priority: d.priority,
      version: d.version,
      created_at: d.created_at,
      updated_at: d.updated_at,
    }
  },
}
