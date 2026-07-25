import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProjectSettings, PromptTemplates } from './types'

interface ProjectStore {
  projects: ProjectSettings[]
  activeProjectId: string | null
  addProject: (p: ProjectSettings) => void
  updateProject: (p: ProjectSettings) => void
  deleteProject: (name: string) => void
  setActiveProject: (name: string | null) => void
}

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set) => ({
      projects: [],
      activeProjectId: null,
      addProject: (p) => set((state) => ({ projects: [...state.projects, p], activeProjectId: p.name })),
      updateProject: (p) => set((state) => ({ projects: state.projects.map(proj => proj.name === p.name ? p : proj) })),
      deleteProject: (name) => set((state) => {
        const next = state.projects.filter(p => p.name !== name)
        return { projects: next, activeProjectId: next.length > 0 ? next[0].name : null }
      }),
      setActiveProject: (name) => set({ activeProjectId: name }),
    }),
    {
      name: 'vidora-projects',
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
  scene: `# Remotion TSX Video Generator\nGenerate production-ready TSX files.\n\n## Settings\n- Format: {{FORMAT}}\n- Resolution: {{WIDTH}}x{{HEIGHT}}\n- Duration: {{DURATION}}s\n- FPS: {{FPS}}\n- Colors: {{COLORS}}\n\n## Code Structure\n\`\`\`tsx\nimport React from 'react';\nimport { useCurrentFrame, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';\n\nconst compositionConfig = { id: 'Scene', durationInFrames: {{DURATION_FRAMES}}, fps: {{FPS}}, width: {{WIDTH}}, height: {{HEIGHT}} };\n// ...\n\`\`\`\n\n## Rules\n1. ALWAYS use Easing.bezier().\n2. NO useState/useEffect.\n\n## [СЦЕНА]\nНазвание: {{SCENE_TITLE}}\nТаймкод: {{SCENE_TIMECODE}}\n\n{{FRAGMENTS}}\n\nGenerate ONLY the complete TSX code.`,
  fragment: `# Remotion TSX Video Generator (Fragment)\nGenerate production-ready TSX files.\n\n## Settings\n- Format: {{FORMAT}} ({{WIDTH}}x{{HEIGHT}})\n- Duration: {{DURATION}}s\n- FPS: {{FPS}}\n- Colors: {{COLORS}}\n\n## Code Structure\n\`\`\`tsx\nimport React from 'react';\nimport { useCurrentFrame, interpolate, Easing, AbsoluteFill, Sequence } from 'remotion';\nconst compositionConfig = { id: 'Fragment', durationInFrames: {{DURATION_FRAMES}}, fps: {{FPS}}, width: {{WIDTH}}, height: {{HEIGHT}} };\n\`\`\`\n\n## [ФРАГМЕНТ]\nСцена: {{SCENE_TITLE}}\nВизуал: {{VISUAL_NOTE}}\nСуфлер: "{{TEXT}}"\n\nGenerate ONLY the complete TSX code.`,
  project: `# Remotion TSX Video Generator (Project)\nGenerate production-ready TSX files.\n\n## Settings\n- Format: {{FORMAT}}\n- FPS: {{FPS}}\n- Colors: {{COLORS}}\n\n## [СЦЕНЫ ПРОЕКТА]\n{{SCENES_LIST}}\n\nGenerate ONLY the complete TSX code.`
}

interface SettingsStore {
  globalPrompts: PromptTemplates
  setGlobalPrompts: (prompts: Partial<PromptTemplates>) => void
  resetGlobalPrompts: () => void
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      globalPrompts: DEFAULT_PROMPTS,
      setGlobalPrompts: (p) => set((s) => ({ globalPrompts: { ...s.globalPrompts, ...p } })),
      resetGlobalPrompts: () => set({ globalPrompts: DEFAULT_PROMPTS })
    }),
    { name: 'vidora-settings' }
  )
)
