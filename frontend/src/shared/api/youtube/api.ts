import { API } from '@shared/lib'
import type {
  HeatmapPoint,
  VideoChapter,
  DetailedComment,
  HookAnalysisData,
  VideoDeepDiveData,
} from './types'

const API_BASE = `${API}/api/v1/youtube`

export const fetchVideoHeatmap = async (videoId: string): Promise<HeatmapPoint[]> => {
  const res = await fetch(`${API_BASE}/video/${encodeURIComponent(videoId)}/heatmap`)
  if (!res.ok) throw new Error(`Failed to fetch heatmap: ${res.statusText}`)
  const json = await res.json()
  return json.heatmap ?? []
}

export const fetchVideoChapters = async (videoId: string): Promise<VideoChapter[]> => {
  const res = await fetch(`${API_BASE}/video/${encodeURIComponent(videoId)}/chapters`)
  if (!res.ok) throw new Error(`Failed to fetch chapters: ${res.statusText}`)
  const json = await res.json()
  return json.chapters ?? []
}

export const fetchDetailedComments = async (videoId: string, maxComments = 50): Promise<DetailedComment[]> => {
  const res = await fetch(`${API_BASE}/video/${encodeURIComponent(videoId)}/comments-detailed?maxComments=${maxComments}`)
  if (!res.ok) throw new Error(`Failed to fetch comments: ${res.statusText}`)
  const json = await res.json()
  return json.comments ?? []
}

export const fetchVideoDeepDive = async (videoId: string): Promise<VideoDeepDiveData> => {
  const res = await fetch(`${API_BASE}/video/${encodeURIComponent(videoId)}/deep-dive`)
  if (!res.ok) throw new Error(`Failed to load deep-dive data: ${res.statusText}`)
  const json = await res.json()
  return {
    videoId: json.video_id,
    metadata: json.metadata,
    heatmap: json.heatmap ?? [],
    chapters: json.chapters ?? [],
    comments: json.comments ?? [],
  }
}

export const analyzeHook = async (transcript: string, language = 'ru'): Promise<HookAnalysisData> => {
  const res = await fetch(`${API_BASE}/agent/analyze-hook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, language, engine: 'auto' }),
  })
  if (!res.ok) throw new Error(`Hook analysis failed: ${res.statusText}`)
  const json = await res.json()
  return json.data
}
