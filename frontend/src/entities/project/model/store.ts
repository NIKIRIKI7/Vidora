import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProjectSettings, PromptTemplates } from './types'

interface ProjectStore {
  projects: ProjectSettings[]
  activeProjectId: string | null
  history: Record<string, { past: ProjectSettings[], future: ProjectSettings[] }>
  addProject: (p: ProjectSettings) => void
  updateProject: (p: ProjectSettings) => void
  deleteProject: (name: string) => void
  setActiveProject: (name: string | null) => void
  undo: () => void
  redo: () => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,
      history: {},
      addProject: (p) => set((state) => ({ 
        projects: [...state.projects, p], 
        activeProjectId: p.name, 
        history: { ...state.history, [p.name]: { past: [], future: [] } } 
      })),
      updateProject: (p) => set((state) => {
        const active = state.activeProjectId
        const current = state.projects.find(proj => proj.name === active)
        if (!active || !current || current.name !== p.name) {
          return { projects: state.projects.map(proj => proj.name === p.name ? p : proj) }
        }
        const hist = state.history[active] || { past: [], future: [] }
        return {
          projects: state.projects.map(proj => proj.name === p.name ? p : proj),
          history: { ...state.history, [active]: { past: [...hist.past, current].slice(-15), future: [] } }
        }
      }),
      deleteProject: (name) => set((state) => {
        const next = state.projects.filter(p => p.name !== name)
        const newHist = { ...state.history }
        delete newHist[name]
        return { projects: next, activeProjectId: next.length > 0 ? next[0].name : null, history: newHist }
      }),
      setActiveProject: (name) => set({ activeProjectId: name }),
      undo: () => set((state) => {
        const active = state.activeProjectId
        if (!active) return state
        const hist = state.history[active]
        if (!hist || hist.past.length === 0) return state
        const previous = hist.past[hist.past.length - 1]
        const newPast = hist.past.slice(0, -1)
        const current = state.projects.find(p => p.name === active)!
        return {
          projects: state.projects.map(p => p.name === active ? previous : p),
          history: { ...state.history, [active]: { past: newPast, future: [current, ...(hist.future || [])] } }
        }
      }),
      redo: () => set((state) => {
        const active = state.activeProjectId
        if (!active) return state
        const hist = state.history[active]
        if (!hist || hist.future.length === 0) return state
        const next = hist.future[0]
        const newFuture = hist.future.slice(1)
        const current = state.projects.find(p => p.name === active)!
        return {
          projects: state.projects.map(p => p.name === active ? next : p),
          history: { ...state.history, [active]: { past: [...hist.past, current], future: newFuture } }
        }
      })
    }),
    {
      name: 'vidora-projects',
      // ponytail: history stays in RAM to avoid QuotaExceededError (5MB localStorage cap)
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
    }
  )
)

interface NotificationState {
  notification: { message: string; type: 'success' | 'error' | 'info' } | null
  showNotification: (message: string, type?: 'success' | 'error' | 'info') => void
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notification: null,
  showNotification: (message, type = 'info') => {
    set({ notification: { message, type } })
    setTimeout(() => set({ notification: null }), 3500)
  }
}))

export const DEFAULT_PROMPTS: PromptTemplates = {
  scene: `# Remotion TSX Video Generator\nGenerate production-ready TSX files.\n\n## Settings\n- Format: {{FORMAT}}\n- Resolution: {{WIDTH}}x{{HEIGHT}}\n- Duration: {{DURATION}}s\n- FPS: {{FPS}}\n- Colors: {{COLORS}}\n\n## Code Structure\n\`\`\`tsx\nimport React from 'react';\nimport { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';\n\nconst compositionConfig = { id: 'Scene', durationInFrames: {{DURATION_FRAMES}}, fps: {{FPS}}, width: {{WIDTH}}, height: {{HEIGHT}} };\n// ...\n\`\`\`\n\n## Rules\n1. ALWAYS use Easing.bezier().\n2. NO useState/useEffect.\n3. Use percentages (e.g. width: '100%') or useVideoConfig() to make layouts responsive to both 16:9 and 9:16.\n\n## [СЦЕНА]\nНазвание: {{SCENE_TITLE}}\nТаймкод: {{SCENE_TIMECODE}}\n\n{{FRAGMENTS}}\n\nGenerate ONLY the complete TSX code.`,
  fragment: `# Remotion TSX Video Generator (Fragment)\nGenerate production-ready TSX files.\n\n## Settings\n- Format: {{FORMAT}} ({{WIDTH}}x{{HEIGHT}})\n- Duration: {{DURATION}}s\n- FPS: {{FPS}}\n- Colors: {{COLORS}}\n\n## Code Structure\n\`\`\`tsx\nimport React from 'react';\nimport { useCurrentFrame, useVideoConfig, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';\nconst compositionConfig = { id: 'Fragment', durationInFrames: {{DURATION_FRAMES}}, fps: {{FPS}}, width: {{WIDTH}}, height: {{HEIGHT}} };\n\`\`\`\n\n## [ФРАГМЕНТ]\nСцена: {{SCENE_TITLE}}\nВизуал: {{VISUAL_NOTE}}\nСуфлер: "{{TEXT}}"\n\nGenerate ONLY the complete TSX code.`,
  project: `# Remotion TSX Video Generator (Project)\nGenerate production-ready TSX files.\n\n## Settings\n- Format: {{FORMAT}}\n- FPS: {{FPS}}\n- Colors: {{COLORS}}\n\n## [СЦЕНЫ ПРОЕКТА]\n{{SCENES_LIST}}\n\nGenerate ONLY the complete TSX code.`
}

interface ApiKeys {
  elevenlabs?: string
  anthropic?: string
  openai?: string
}

interface SettingsStore {
  globalPrompts: PromptTemplates
  setGlobalPrompts: (prompts: Partial<PromptTemplates>) => void
  resetGlobalPrompts: () => void
  ttsEngine: string
  llmEngine: string
  apiKeys: ApiKeys
  setTtsEngine: (engine: string) => void
  setLlmEngine: (engine: string) => void
  setApiKey: (provider: keyof ApiKeys, key: string) => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      globalPrompts: DEFAULT_PROMPTS,
      setGlobalPrompts: (p) => set((s) => ({ globalPrompts: { ...s.globalPrompts, ...p } })),
      resetGlobalPrompts: () => set({ globalPrompts: DEFAULT_PROMPTS }),
      ttsEngine: 'omnivoice',
      llmEngine: 'ollama',
      apiKeys: {},
      setTtsEngine: (engine) => set({ ttsEngine: engine }),
      setLlmEngine: (engine) => set({ llmEngine: engine }),
      setApiKey: (provider, key) => set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
    }),
    { name: 'vidora-settings' }
  )
)
