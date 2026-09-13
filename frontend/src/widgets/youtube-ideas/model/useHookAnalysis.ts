import { useState } from 'react'
import { fetchClient, apiErrorMessage } from '@shared/api'
import type { ApiKeys, HookAnalysisData, VideoResult } from '@entities/project'

export interface HookAnalysisParams {
  effectiveEngine: string
  language: string
  apiKeys: ApiKeys
  showNotification: (message: string, type?: 'success' | 'error' | 'info', details?: string) => void
}

export const useHookAnalysis = ({ effectiveEngine, language, apiKeys, showNotification }: HookAnalysisParams) => {
  const [hookModalOpen, setHookModalOpen] = useState(false)
  const [isHookAnalyzing, setIsHookAnalyzing] = useState(false)
  const [hookData, setHookData] = useState<HookAnalysisData | null>(null)
  const [selectedVideoForHook, setSelectedVideoForHook] = useState<VideoResult | null>(null)

  const analyzeHook = async (video: VideoResult) => {
    setSelectedVideoForHook(video)
    setHookData(null)
    setHookModalOpen(true)
    setIsHookAnalyzing(true)
    try {
      const { data, error } = await fetchClient.POST('/api/v1/youtube/agent/analyze-hook', {
        body: {
          transcript: video.title,
          video_id: video.video_id,
          video_url: video.url,
          engine: effectiveEngine,
          language,
          api_keys: apiKeys
        }
      })
      if (error || data === undefined) throw new Error(apiErrorMessage(error))
      if (data.status === 'ok') setHookData(data.data as unknown as HookAnalysisData)
      else throw new Error()
    } catch {
      showNotification('Ошибка анализа хука', 'error')
      setHookModalOpen(false)
    } finally {
      setIsHookAnalyzing(false)
    }
  }

  const closeHookModal = () => setHookModalOpen(false)

  return {
    hookModalOpen,
    isHookAnalyzing,
    hookData,
    selectedVideoForHook,
    analyzeHook,
    closeHookModal,
  }
}
