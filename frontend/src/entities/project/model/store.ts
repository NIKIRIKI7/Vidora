import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { ProjectSettings } from './types'

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
        projects: state.projects.map((p) => {
          const copy = { ...p }
          delete copy.projectDir
          return copy
        }),
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
