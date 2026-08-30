import { create } from 'zustand'
import { useProjectStore } from '@entities/project'
import type { FPS, ProjectSettings } from '@entities/project'
import { dashboardApi } from '../api/dashboardApi'
import type { GlobalSettings, HardwareInfo, ProjectCreatePayload, ProjectItem } from '../types'

const toProjectItem = (p: ProjectSettings): ProjectItem => ({
  id: p.name,
  name: p.name,
  format: p.format,
  scene_count: p.scenes.length,
  duration_sec: p.scenes.reduce((acc, s) => acc + (s.fragments?.length || 0) * 5, 0),
  updated_at: new Date().toISOString(),
  has_audio: p.scenes.some((s) => (s.fragments || []).some((f) => !!f.audioFileName)),
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
  scenes: [],
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
  currentView: 'dashboard' | 'motion_studio' | 'project_editor'
  activeProjectId: string | null
  settings: GlobalSettings
  isLoading: boolean

  fetchDashboardData: () => Promise<void>
  setSearchQuery: (query: string) => void
  setFormatFilter: (filter: 'all' | '16:9' | '9:16') => void
  openModal: (modal: DashboardModal, defaultFormat?: '16:9' | '9:16') => void
  closeModal: () => void
  setCurrentView: (view: 'dashboard' | 'motion_studio' | 'project_editor') => void
  openProject: (projectId: string) => void
  createProject: (payload: ProjectCreatePayload) => ProjectItem
  deleteProject: (projectId: string) => void
  duplicateProject: (projectId: string) => void
  saveSettings: (settings: GlobalSettings) => void
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
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
    const hardware = await dashboardApi.getHardwareInfo()
    const real = useProjectStore.getState().projects
    const projects = real.length > 0 ? real.map(toProjectItem) : dashboardApi.getSavedProjects()
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
      useProjectStore.getState().setActiveProject(projectId)
    }
    set({ activeProjectId: projectId, currentView: 'project_editor' })
  },

  createProject: (payload: ProjectCreatePayload) => {
    const created = dashboardApi.createProject(payload)
    useProjectStore.getState().addProject(buildRealProject(payload))
    useProjectStore.getState().setActiveProject(payload.name)
    set({
      projects: dashboardApi.getSavedProjects(),
      activeModal: null,
      activeProjectId: created.id,
      currentView: 'project_editor',
    })
    return created
  },

  deleteProject: (projectId: string) => {
    dashboardApi.deleteProject(projectId)
    useProjectStore.getState().deleteProject(projectId)
    set({ projects: dashboardApi.getSavedProjects() })
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
    } else {
      const project = get().projects.find((p) => p.id === projectId)
      if (!project) return
      dashboardApi.createProject({
        name: `${project.name} (Копия)`,
        format: project.format,
        fps: 30,
        animationStyle: 'cinematic_smooth',
        colors: {
          primary: '#38bdf8',
          secondary: '#818cf8',
          background: '#020617',
          surface: '#0f172a',
          accent: '#f43f5e',
          text: '#f8fafc',
        },
      })
    }
    set({ projects: dashboardApi.getSavedProjects() })
  },

  saveSettings: (settings: GlobalSettings) => {
    dashboardApi.saveSettings(settings)
    set({ settings, activeModal: null })
  },
}))
