import type { AppColors, BackgroundMusicSettings } from '@shared/config'

export type { AppColors }
export type Resolution = '1080p' | '1440p' | '2160p'
export type VideoFormat = '16:9' | '9:16'
export type FPS = '24' | '30' | '60'
export type AudioGenerationMode = 'fragment' | 'scene' | 'project'
export type TaskType = 'scenario' | 'visual' | 'audio' | 'broll'

export interface GlobalVoice {
  id: string
  name: string
  ttsEngine: string
  voiceModel: string
  refAudioPath?: string
  refText?: string
  designPrompt?: string
  settings: {
    speed: number
    guidanceScale: number
    numSteps: number
  }
}

export interface IdeaFormat {
  titles: string[]
  description: string
  thumbnail_concept: string
}

export interface VideoResult {
  video_id: string
  title: string
  channel: string
  views: number
  subs: number
  ratio: number
  vph: number
  url: string
  published_at: string
  transcript_sample?: string
  duration_sec?: number
  is_short?: boolean
  keyword_found?: string
}

export interface HookAnalysisData {
  original_hook?: string
  psychology?: string
  stolen_hooks?: string[]
}

export interface AudioProcessingSettings {
  silenceThresholdDb: number
  minSilenceMs: number
  maxSilenceMs: number
  removeEdges: boolean
}

export interface Metadata {
  title: string
  description: string
  tags: string[]
  thumbnail?: string
}

export interface MontageSettings {
  fps: FPS
  animationStyle: string
  transitions: string[]
  colors: AppColors
  typography: { heading: string; body: string }
}

export interface SceneFragment {
  id: string
  visualNote: string
  text: string
  startTime?: number | null
  endTime?: number | null
  remotionCode?: string
  audioFileName?: string
  bRollFileName?: string
  lastAudioHash?: string
  lastAudioTextNormalized?: string
}

export interface Scene {
  id: string
  title: string
  timecode: string
  fragments: SceneFragment[]
  remotionCode?: string
  ignoreTsx?: boolean
  remotionCodeHistory?: string[]
  historyIndex?: number
  lastCodeHash?: string
  audioOffset?: number
}

export interface CustomVoice {
  id: string
  name: string
  refAudioPath: string
  refText: string
  designPrompt?: string
  tags?: string[]
}

export interface ApiKeys {
  elevenlabs?: string
  anthropic?: string
  openai?: string
  routerai?: string
  aitunnel?: string
  youtube?: string
  pexels?: string
}

export interface PromptVersion {
  id: string
  name: string
  content: string
}

export interface PromptCategory {
  activeId: string
  versions: PromptVersion[]
}

export interface GlobalPromptSettings {
  scene: PromptCategory
  fragment: PromptCategory
  project: PromptCategory
  fixPacing: PromptCategory
  scenario: PromptCategory
}

export interface PromptTemplates {
  scene: string
  fragment: string
  project: string
  fixPacing: string
  scenario: string
}

export type ProcessType = 'scenario' | 'project' | 'scene' | 'fragment' | 'audio' | 'analysis' | 'broll'

export interface Skill {
  id: string
  title: string
  description: string
  content: string
  isCustom: boolean
  applyTo: ProcessType[]
}

export interface ProjectSettings {
  name: string
  format: VideoFormat
  resolution: Resolution
  metadata: Metadata
  montage: MontageSettings
  scenes: Scene[]
  customVoices?: CustomVoice[]
  rawMarkdown: string
  promptOverrides?: Partial<PromptTemplates>
  audioMode: AudioGenerationMode
  activeGlobalVoiceId?: string
  audioProcessing: AudioProcessingSettings
  backgroundMusic?: BackgroundMusicSettings
  use3D?: boolean
  autoBRollEnabled?: boolean
}

export type { DuckingPreset, MusicEqSettings, BackgroundMusicSettings, MusicTrackItem, MusicCategory } from '@shared/config'
