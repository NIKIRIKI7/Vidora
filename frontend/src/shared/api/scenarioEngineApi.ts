import { fetchClient, apiErrorMessage } from '@shared/api'

export type IssueSeverity = 'Info' | 'Warning' | 'Error'

export interface ScenarioIssue {
  fragment_id: string | null
  scene_id: string | null
  severity: IssueSeverity
  code: string
  message: string
}

export interface AstFragment {
  visual_note: string
  spoken_text: string
  declared_time_start: string | null
  declared_time_end: string | null
  media_link: string | null
  animation_type: string | null
  animation_asset_link: string | null
  sfx_list: string[]
}

export interface AstTransition {
  transition_type: string
  description: string
}

export type AstNode = AstFragment | AstTransition

export interface AstScene {
  title: string
  declared_timecode: string | null
  nodes: AstNode[]
}

export interface ScenarioAstDocument {
  frontmatter: {
    title: string
    fps: number
    aspect_ratio: string
    colors: Record<string, string>
  }
  scenes: AstScene[]
}

export interface EngineSyncResponse {
  formatted_markdown: string
  ast_tree: ScenarioAstDocument
  issues: ScenarioIssue[]
  computed_duration_seconds: number
}

export interface DraftLintResponse {
  issues: ScenarioIssue[]
  computed_duration_seconds: number
}

export interface ScenarioRewriteSuggestion {
  visual_note: string
  spoken_text: string
}

export const isAstFragment = (node: AstNode): node is AstFragment => 'spoken_text' in node
export const isAstTransition = (node: AstNode): node is AstTransition => 'transition_type' in node

export const scenarioEngineApi = {
  // Двусторонняя синхронизация (Главный Шлюз / Facade)
  syncMarkdown: async (projectId: string, markdown: string): Promise<EngineSyncResponse> => {
    const { data, error } = await fetchClient.POST('/api/v1/production/engine/{projectId}/sync', {
      params: { path: { projectId } },
      body: { markdown },
    })
    if (error || data === undefined) throw new Error(apiErrorMessage(error))
    return data.data as unknown as EngineSyncResponse
  },

  // Stateless-проверка черновика (ScenarioBuilder): парсер -> линтер, без сохранения проекта
  lintDraft: async (markdown: string): Promise<DraftLintResponse> => {
    const { data, error } = await fetchClient.POST('/api/v1/production/engine/lint-draft', { body: { markdown } })
    if (error || data === undefined) throw new Error(apiErrorMessage(error))
    return data.data as unknown as DraftLintResponse
  },

  // ИИ-Копайлот для рерайтинга (Центральный блок)
  rewriteFragment: async (projectId: string, fragmentId: string, command: string): Promise<ScenarioRewriteSuggestion[]> => {
    const { data, error } = await fetchClient.POST('/api/v1/production/engine/{projectId}/copilot/rewrite', {
      params: { path: { projectId } },
      body: { fragment_id: fragmentId, command },
    })
    if (error || data === undefined) throw new Error(apiErrorMessage(error))
    return data.suggestions as unknown as ScenarioRewriteSuggestion[]
  },
}

// Ленивое создание backend-проекта под локальный проект (первый /engine/sync)
export const createProductionProject = async (title: string): Promise<string> => {
  const { data, error } = await fetchClient.POST('/api/v1/production/projects', { body: { title } })
  if (error || data === undefined) throw new Error(apiErrorMessage(error))
  return data.id as string
}
