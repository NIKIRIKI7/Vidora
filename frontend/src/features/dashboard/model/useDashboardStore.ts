import { create } from 'zustand'
import { useProjectStore } from '@entities/project'
import type { FPS, ProjectSettings } from '@entities/project'
import { dashboardApi } from '../api/dashboardApi'
import type { GlobalSettings, HardwareInfo, ProjectCreatePayload, ProjectItem } from '../types'

const calculateProjectDuration = (p: ProjectSettings): number => {
  let totalSec = 0
  for (const s of p.scenes) {
    const syncedMax = Math.max(...(s.fragments || []).map((f) => f.endTime || 0), 0)
    if (syncedMax > 0) {
      totalSec += syncedMax
    } else {
      totalSec += (s.fragments || []).reduce(
        (acc, f) => acc + Math.max((f.text || '').split(/\s+/).filter(Boolean).length / 2.5, 3.0),
        0
      )
    }
  }
  return Math.round(totalSec)
}

const toProjectItem = (p: ProjectSettings): ProjectItem => ({
  id: p.name,
  name: p.name,
  format: p.format,
  scene_count: p.scenes.length,
  duration_sec: calculateProjectDuration(p),
  updated_at: new Date().toISOString(),
  has_audio: p.scenes.some((s) => (s.fragments || []).some((f) => Boolean(f.audioFileName))),
  status: 'draft',
})

const buildRealProject = (payload: ProjectCreatePayload): ProjectSettings => ({
  name: payload.name.trim(),
  format: payload.format,
  resolution: '1080p',
  metadata: { title: payload.name.trim(), description: '', tags: [] },
  montage: {
    fps: String(payload.fps) as FPS,
    animationStyle: payload.animationStyle,
    transitions: [],
    colors: payload.colors,
    typography: { heading: 'Inter', body: 'Geist' },
  },
  scenes: [
    {
      id: crypto.randomUUID(),
      title: 'Сцена 1',
      timecode: '00:00:00',
      fragments: [
        {
          id: crypto.randomUUID(),
          visualNote: 'A-roll: Описание первого кадра',
          text: 'Текст первой сцены...',
        },
      ],
    },
  ],
  rawMarkdown: '',
  audioMode: 'scene',
  audioProcessing: { silenceThresholdDb: -45.0, minSilenceMs: 200, maxSilenceMs: 100, removeEdges: false },
})

type DashboardModal = 'new_project' | 'settings' | 'trend_agent' | 'voice_lab' | 'script_lab'

interface DashboardState {
  hardware: HardwareInfo | null
  projects: ProjectItem[]
  searchQuery: string
  formatFilter: 'all' | '16:9' | '9:16'
  activeModal: DashboardModal | null
  selectedFormatForNew: '16:9' | '9:16'
  currentView: 'dashboard' | 'project_editor'
  activeProjectId: string | null
  settings: GlobalSettings
  isLoading: boolean

  fetchDashboardData: () => Promise<void>
  setSearchQuery: (query: string) => void
  setFormatFilter: (filter: 'all' | '16:9' | '9:16') => void
  openModal: (modal: DashboardModal, defaultFormat?: '16:9' | '9:16') => void
  closeModal: () => void
  setCurrentView: (view: 'dashboard' | 'project_editor') => void
  openProject: (projectId: string) => void
  createProject: (payload: ProjectCreatePayload) => ProjectItem
  deleteProject: (projectId: string) => void
  duplicateProject: (projectId: string) => void
  saveSettings: (settings: GlobalSettings) => void
}

export const useDashboardStore = create<DashboardState>((set) => ({
  hardware: null,
  projects: [],
  searchQuery: '',
  formatFilter: 'all',
  activeModal: null,
  selectedFormatForNew: '16:9',
  currentView: 'dashboard',
  activeProjectId: null,
  settings: dashboardApi.getSettings(),
  isLoading: false,

  fetchDashboardData: async () => {
    set({ isLoading: true })
    localStorage.removeItem('vidora_projects_meta')

    const hardware = await dashboardApi.getHardwareInfo()
    const realProjects = useProjectStore.getState().projects
    const projects = realProjects.map(toProjectItem)
    const settings = dashboardApi.getSettings()

    set({ hardware, projects, settings, isLoading: false })
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setFormatFilter: (filter: 'all' | '16:9' | '9:16') => set({ formatFilter: filter }),
  openModal: (modal, defaultFormat = '16:9') => set({ activeModal: modal, selectedFormatForNew: defaultFormat }),
  closeModal: () => set({ activeModal: null }),
  setCurrentView: (view) => set({ currentView: view }),

  openProject: (projectId: string) => {
    const real = useProjectStore.getState().projects.find((p) => p.name === projectId)
    if (real) {
      useProjectStore.getState().setActiveProject(real.name)
      set({ activeProjectId: real.name, currentView: 'project_editor' })
    }
  },

  createProject: (payload: ProjectCreatePayload) => {
    const newProj = buildRealProject(payload)
    useProjectStore.getState().addProject(newProj)
    useProjectStore.getState().setActiveProject(newProj.name)

    const updatedProjects = useProjectStore.getState().projects.map(toProjectItem)
    const createdItem = toProjectItem(newProj)

    set({
      projects: updatedProjects,
      activeModal: null,
      activeProjectId: newProj.name,
      currentView: 'project_editor',
    })

    return createdItem
  },

  deleteProject: (projectId: string) => {
    useProjectStore.getState().deleteProject(projectId)
    const updatedProjects = useProjectStore.getState().projects.map(toProjectItem)
    set({ projects: updatedProjects })
  },

  duplicateProject: (projectId: string) => {
    const real = useProjectStore.getState().projects.find((p) => p.name === projectId)
    if (real) {
      const copy: ProjectSettings = {
        ...real,
        name: `${real.name} (Копия)`,
        scenes: JSON.parse(JSON.stringify(real.scenes)) as ProjectSettings['scenes'],
      }
      useProjectStore.getState().addProject(copy)
      const updatedProjects = useProjectStore.getState().projects.map(toProjectItem)
      set({ projects: updatedProjects })
    }
  },

  saveSettings: (settings: GlobalSettings) => {
    dashboardApi.saveSettings(settings)
    set({ settings, activeModal: null })
  },
}))
