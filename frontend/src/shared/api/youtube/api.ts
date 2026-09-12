import { fetchClient, apiErrorMessage } from '@shared/api'
import type {
  HeatmapPoint,
  VideoChapter,
  DetailedComment,
  HookAnalysisData,
  VideoCandidateMeta,
  VideoDeepDiveData,
} from './types'

export const fetchVideoHeatmap = async (videoId: string): Promise<HeatmapPoint[]> => {
  const { data, error } = await fetchClient.GET('/api/v1/youtube/video/{videoId}/heatmap', {
    params: { path: { videoId } },
  })
  if (error || data === undefined) throw new Error(apiErrorMessage(error))
  const json = data
  return (json.heatmap ?? []) as HeatmapPoint[]
}

export const fetchVideoChapters = async (videoId: string): Promise<VideoChapter[]> => {
  const { data, error } = await fetchClient.GET('/api/v1/youtube/video/{videoId}/chapters', {
    params: { path: { videoId } },
  })
  if (error || data === undefined) throw new Error(apiErrorMessage(error))
  const json = data
  return (json.chapters ?? []) as VideoChapter[]
}

export const fetchDetailedComments = async (videoId: string, maxComments = 50): Promise<DetailedComment[]> => {
  const { data, error } = await fetchClient.GET('/api/v1/youtube/video/{videoId}/comments-detailed', {
    params: { path: { videoId }, query: { maxComments } },
  })
  if (error || data === undefined) throw new Error(apiErrorMessage(error))
  const json = data
  return (json.comments ?? []) as DetailedComment[]
}

export const fetchVideoDeepDive = async (videoId: string): Promise<VideoDeepDiveData> => {
  const { data, error } = await fetchClient.GET('/api/v1/youtube/video/{videoId}/deep-dive', {
    params: { path: { videoId } },
  })
  if (error || data === undefined) throw new Error(apiErrorMessage(error))
  const json = data
  return {
    videoId: json.video_id as string,
    metadata: json.metadata as VideoCandidateMeta | undefined,
    heatmap: (json.heatmap ?? []) as HeatmapPoint[],
    chapters: (json.chapters ?? []) as VideoChapter[],
    comments: (json.comments ?? []) as DetailedComment[],
  }
}

export const analyzeHook = async (transcript: string, language = 'ru'): Promise<HookAnalysisData> => {
  const { data, error } = await fetchClient.POST('/api/v1/youtube/agent/analyze-hook', {
    body: { transcript, language, engine: 'auto' },
  })
  if (error || data === undefined) throw new Error(apiErrorMessage(error))
  const json = data
  return json.data as unknown as HookAnalysisData
}
