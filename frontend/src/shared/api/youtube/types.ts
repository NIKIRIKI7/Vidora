export interface HeatmapPoint {
  startSeconds: number
  endSeconds: number
  intensity: number
}

export interface VideoChapter {
  startSeconds: number
  endSeconds: number
  title: string
  thumbnailUrl: string
}

export interface DetailedComment {
  authorName: string
  authorChannelId: string
  text: string
  likeCount: number
  publishedTime: string
  commentId: string
}

export interface StolenHook {
  angle: string
  hook_0_5s: string
  hook_5_20s: string
  why_it_converts: string
}

export interface HookAnalysisData {
  original_hook: string
  psychology: string
  flaws_identified: string
  stolen_hooks: StolenHook[]
}

export interface VideoCandidateMeta {
  videoId: string
  title: string
  channelTitle: string
  channelId?: string
  subscriberCount?: number
  viewCount: number
  durationSeconds?: number
  thumbnailUrl?: string
  ratio?: number
  vph?: number
  isRocket?: boolean
}

export interface VideoDeepDiveData {
  videoId: string
  metadata?: VideoCandidateMeta
  heatmap: HeatmapPoint[]
  chapters: VideoChapter[]
  comments: DetailedComment[]
}
