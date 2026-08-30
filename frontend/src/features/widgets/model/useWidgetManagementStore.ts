import { create } from 'zustand'
import { widgetsApi } from '../api/widgetsApi'
import type { CustomWidgetCreatePayload, PropValue, WidgetMetadata } from '../api/widgetsApi'

interface WidgetStudioState {
  widgets: WidgetMetadata[]
  selectedWidgetId: string | null
  activeCategory: string | null
  searchQuery: string
  liveProps: Record<string, PropValue>
  previewFrame: number
  isPlaying: boolean
  durationFrames: number
  viewportFormat: '16:9' | '9:16'
  showSafeZones: boolean
  backgroundMode: 'dark_grid' | 'slate' | 'neon' | 'checkerboard'
  activeTab: 'canvas' | 'code' | 'docs'
  isCreateModalOpen: boolean
  isImportExportModalOpen: boolean
  importExportTab: 'import' | 'export'
  isLoading: boolean
  error: string | null

  fetchWidgets: () => Promise<void>
  selectWidget: (widgetId: string) => void
  setActiveCategory: (category: string | null) => void
  setSearchQuery: (query: string) => void
  updateLiveProp: (name: string, value: PropValue) => void
  resetLiveProps: () => void
  setPreviewFrame: (frame: number) => void
  setIsPlaying: (isPlaying: boolean) => void
  setViewportFormat: (format: '16:9' | '9:16') => void
  setShowSafeZones: (show: boolean) => void
  setBackgroundMode: (mode: 'dark_grid' | 'slate' | 'neon' | 'checkerboard') => void
  setActiveTab: (tab: 'canvas' | 'code' | 'docs') => void
  openCreateModal: () => void
  closeCreateModal: () => void
  openImportExportModal: (tab?: 'import' | 'export') => void
  closeImportExportModal: () => void
  createWidget: (payload: CustomWidgetCreatePayload) => Promise<void>
  deleteWidget: (widgetId: string) => Promise<void>
  importWidgetsJson: (jsonObj: Record<string, unknown>) => Promise<number>
  exportWidgetsJson: (ids?: string[]) => Promise<string>
}

const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export const useWidgetManagementStore = create<WidgetStudioState>((set, get) => ({
  widgets: [],
  selectedWidgetId: null,
  activeCategory: null,
  searchQuery: '',
  liveProps: {},
  previewFrame: 30,
  isPlaying: true,
  durationFrames: 120,
  viewportFormat: '16:9',
  showSafeZones: false,
  backgroundMode: 'dark_grid',
  activeTab: 'canvas',
  isCreateModalOpen: false,
  isImportExportModalOpen: false,
  importExportTab: 'export',
  isLoading: false,
  error: null,

  fetchWidgets: async () => {
    set({ isLoading: true, error: null })
    try {
      const widgets = await widgetsApi.getAll()
      set({
        widgets,
        isLoading: false,
        selectedWidgetId: get().selectedWidgetId || widgets[0]?.id || null,
      })
      if (!get().selectedWidgetId && widgets.length > 0) {
        get().selectWidget(widgets[0].id)
      }
    } catch (err) {
      set({ error: errorMessage(err), isLoading: false })
    }
  },

  selectWidget: (widgetId: string) => {
    const widget = get().widgets.find((w) => w.id === widgetId)
    if (!widget) return
    const initialProps: Record<string, PropValue> = { ...widget.default_props }
    widget.props.forEach((p) => {
      if (initialProps[p.name] === undefined && p.default !== undefined) {
        initialProps[p.name] = p.default
      }
    })
    set({
      selectedWidgetId: widgetId,
      liveProps: initialProps,
      previewFrame: 15,
      isPlaying: true,
    })
  },

  setActiveCategory: (category: string | null) => set({ activeCategory: category }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),

  updateLiveProp: (name: string, value: PropValue) => {
    set((state) => ({
      liveProps: { ...state.liveProps, [name]: value },
    }))
  },

  resetLiveProps: () => {
    const { selectedWidgetId, widgets } = get()
    if (!selectedWidgetId) return
    const widget = widgets.find((w) => w.id === selectedWidgetId)
    if (widget) {
      set({ liveProps: { ...widget.default_props } })
    }
  },

  setPreviewFrame: (frame: number) => set({ previewFrame: frame }),
  setIsPlaying: (isPlaying: boolean) => set({ isPlaying }),
  setViewportFormat: (viewportFormat) => set({ viewportFormat }),
  setShowSafeZones: (showSafeZones) => set({ showSafeZones }),
  setBackgroundMode: (backgroundMode) => set({ backgroundMode }),
  setActiveTab: (activeTab) => set({ activeTab }),

  openCreateModal: () => set({ isCreateModalOpen: true }),
  closeCreateModal: () => set({ isCreateModalOpen: false }),

  openImportExportModal: (tab = 'export') => set({ isImportExportModalOpen: true, importExportTab: tab }),
  closeImportExportModal: () => set({ isImportExportModalOpen: false }),

  createWidget: async (payload) => {
    set({ isLoading: true })
    try {
      const created = await widgetsApi.create(payload)
      const updatedList = [...get().widgets, created]
      set({ widgets: updatedList, isLoading: false, isCreateModalOpen: false })
      get().selectWidget(created.id)
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err) })
      throw err
    }
  },

  deleteWidget: async (widgetId: string) => {
    set({ isLoading: true })
    try {
      await widgetsApi.delete(widgetId)
      const filtered = get().widgets.filter((w) => w.id !== widgetId)
      set({
        widgets: filtered,
        isLoading: false,
        selectedWidgetId: filtered[0]?.id || null,
      })
      if (filtered.length > 0) {
        get().selectWidget(filtered[0].id)
      }
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err) })
      throw err
    }
  },

  importWidgetsJson: async (jsonObj) => {
    set({ isLoading: true, error: null })
    try {
      const res = await widgetsApi.importPackage(jsonObj, true)
      await get().fetchWidgets()
      return res.imported_count
    } catch (err) {
      set({ isLoading: false, error: errorMessage(err) })
      throw err
    }
  },

  exportWidgetsJson: async (ids?: string[]) => {
    const pkg = await widgetsApi.exportPackage(ids)
    return JSON.stringify(pkg, null, 2)
  },
}))
