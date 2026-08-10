import type { AppColors } from '@shared/config'

export type { AppColors }
export type Resolution = '1080p' | '1440p' | '2160p'
export type VideoFormat = '16:9' | '9:16'
export type FPS = '24' | '30' | '60'
export type AudioGenerationMode = 'fragment' | 'scene' | 'project'

export interface GlobalVoice {
  id: string
  name: string
  ttsEngine: string
  voiceModel: string
  refAudioPath?: string
  refText?: string
  settings: {
    speed: number
    guidanceScale: number
    numSteps: number
  }
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
  tags?: string[]
}

export interface ApiKeys {
  elevenlabs?: string
  anthropic?: string
  openai?: string
  routerai?: string
  aitunnel?: string
  youtube?: string
}

export interface PromptTemplates {
  scene: string
  fragment: string
  project: string
  fixPacing: string
}

export interface SyncedSkills {
  synced_at: string
  skills: { id: string; title: string; description: string; content: string }[]
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
  use3D?: boolean
  syncedSkills?: SyncedSkills
}
