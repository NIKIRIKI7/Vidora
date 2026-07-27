export type Resolution = '1080p' | '1440p' | '2160p'
export type VideoFormat = '16:9' | '9:16'
export type FPS = '24' | '30' | '60'

export interface AppColors {
  primary: string
  secondary: string
  background: string
  surface: string
  accent: string
  text: string
}

export interface AppTypography {
  heading: string
  body: string
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
  typography: AppTypography
}

export interface SceneFragment {
  id: string
  visualNote: string
  text: string
  startTime?: number
  endTime?: number
  remotionCode?: string
  audioFileName?: string
  bRollFileName?: string
  lastAudioHash?: string
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
}

export interface PromptTemplates {
  scene: string
  fragment: string
  project: string
  fixPacing: string
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
}
