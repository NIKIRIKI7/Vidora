import { API } from '@shared/lib'

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

const ENGINE_BASE = `${API}/api/v1/production/engine`
const PRODUCTION_BASE = `${API}/api/v1/production`

const parseJson = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.detail || body.message || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const scenarioEngineApi = {
  // Двусторонняя синхронизация (Главный Шлюз / Facade)
  syncMarkdown: async (projectId: string, markdown: string): Promise<EngineSyncResponse> => {
    const res = await fetch(`${ENGINE_BASE}/${encodeURIComponent(projectId)}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown }),
    })
    const data = await parseJson<{ data: EngineSyncResponse }>(res)
    return data.data
  },

  // Stateless-проверка черновика (ScenarioBuilder): парсер -> линтер, без сохранения проекта
  lintDraft: async (markdown: string): Promise<DraftLintResponse> => {
    const res = await fetch(`${ENGINE_BASE}/lint-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ markdown }),
    })
    const data = await parseJson<{ data: DraftLintResponse }>(res)
    return data.data
  },

  // ИИ-Копайлот для рерайтинга (Центральный блок)
  rewriteFragment: async (projectId: string, fragmentId: string, command: string): Promise<ScenarioRewriteSuggestion[]> => {
    const res = await fetch(`${ENGINE_BASE}/${encodeURIComponent(projectId)}/copilot/rewrite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fragment_id: fragmentId, command }),
    })
    const data = await parseJson<{ suggestions: ScenarioRewriteSuggestion[] }>(res)
    return data.suggestions
  },
}

// Ленивое создание backend-проекта под локальный проект (первый /engine/sync)
export const createProductionProject = async (title: string): Promise<string> => {
  const res = await fetch(`${PRODUCTION_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  const data = await parseJson<{ id: string }>(res)
  return data.id
}
