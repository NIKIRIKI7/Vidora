import { fetchClient, apiErrorMessage } from '@shared/api'

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

interface RawSkillDto {
  id: string
  name: string
  description?: string
  content?: string
  prompt?: string
  stage?: SkillStage
  is_enabled?: boolean
  is_active?: boolean
  is_default?: boolean
  priority?: number
  version?: number
  created_at?: string
  updated_at?: string
}

type ResolvedSkillDto = RawSkillDto & {
  stage: SkillStage
  priority: number
  version: number
  created_at: string
  updated_at: string
}

export const skillsApi = {
  async getAll(stage?: SkillStage, isActive?: boolean): Promise<SkillItem[]> {
    const { data, error } = await fetchClient.GET('/api/v1/skills', {
      params: { query: { stage, only_enabled: isActive } },
    })
    if (error || data === undefined) throw new Error(apiErrorMessage(error))

    return (data as unknown as ResolvedSkillDto[]).map((d) => ({
      id: d.id,
      name: d.name,
      description: d.description || '',
      prompt: d.content || d.prompt || '',
      stage: d.stage ?? 'general',
      is_active: d.is_enabled ?? d.is_active ?? true,
      is_custom: !d.is_default,
      priority: d.priority ?? 100,
      version: d.version ?? 1,
      created_at: d.created_at ?? '',
      updated_at: d.updated_at ?? '',
    }))
  },

  async getById(id: string): Promise<SkillItem> {
    const { data, error } = await fetchClient.GET('/api/v1/skills/{id}', { params: { path: { id } } })
    if (error || data === undefined) throw new Error(apiErrorMessage(error))
    const d = data as unknown as ResolvedSkillDto
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
    const { data: response, error } = await fetchClient.POST('/api/v1/skills', {
      body: {
        id: `skill-${data.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        name: data.name,
        description: data.description || '',
        content: data.prompt,
        stage: data.stage,
        priority: data.priority ?? 100,
      },
    })
    if (error || response === undefined) throw new Error(apiErrorMessage(error))
    const d = response as unknown as ResolvedSkillDto
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
    const { data: response, error } = await fetchClient.PATCH('/api/v1/skills/{id}', {
      params: { path: { id } },
      body: {
        name: data.name,
        description: data.description,
        content: data.prompt,
        is_enabled: data.is_active,
        priority: data.priority,
      },
    })
    if (error || response === undefined) throw new Error(apiErrorMessage(error))
    const d = response as unknown as ResolvedSkillDto
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
    const { error } = await fetchClient.DELETE('/api/v1/skills/{id}', { params: { path: { id } } })
    if (error) throw new Error(apiErrorMessage(error))
  },

  async resetSkill(id: string): Promise<SkillItem> {
    const { data, error } = await fetchClient.POST('/api/v1/system/skills/{id}/reset', {
      params: { path: { id } },
    })
    if (error || data === undefined) throw new Error(apiErrorMessage(error))
    const d = data as unknown as ResolvedSkillDto
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
