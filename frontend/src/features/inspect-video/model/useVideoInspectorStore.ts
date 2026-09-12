import { create } from 'zustand'
import type { VideoCandidateMeta, VideoDeepDiveData } from '@shared/api'
import { fetchVideoDeepDive } from '@shared/api'

interface VideoInspectorState {
  isOpen: boolean
  activeTab: 'retention' | 'comments' | 'hook'
  candidate: VideoCandidateMeta | null
  deepDive: VideoDeepDiveData | null
  isLoading: boolean
  error: string | null
  cache: Record<string, VideoDeepDiveData>
  openInspector: (candidate: VideoCandidateMeta) => Promise<void>
  closeInspector: () => void
  setActiveTab: (tab: 'retention' | 'comments' | 'hook') => void
}

export const useVideoInspectorStore = create<VideoInspectorState>((set, get) => ({
  isOpen: false,
  activeTab: 'retention',
  candidate: null,
  deepDive: null,
  isLoading: false,
  error: null,
  cache: {},

  openInspector: async (candidate) => {
    set({ isOpen: true, candidate, activeTab: 'retention', error: null })

    const cached = get().cache[candidate.videoId]
    if (cached) {
      set({ deepDive: cached, isLoading: false })
      return
    }

    set({ isLoading: true, deepDive: null })
    try {
      const data = await fetchVideoDeepDive(candidate.videoId)
      set((state) => ({
        deepDive: data,
        isLoading: false,
        cache: { ...state.cache, [candidate.videoId]: data },
      }))
    } catch (err: unknown) {
      set({ error: err instanceof Error ? err.message : 'Не удалось загрузить аналитику ролика', isLoading: false })
    }
  },

  closeInspector: () => set({ isOpen: false, candidate: null, deepDive: null }),
  setActiveTab: (activeTab) => set({ activeTab }),
}))
