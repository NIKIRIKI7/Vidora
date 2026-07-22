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
}

export interface Scene {
  id: string
  title: string
  timecode: string
  fragments: SceneFragment[]
  remotionCode?: string
}

export interface CustomVoice {
  id: string
  name: string
  refAudioPath: string
  refText: string
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
  projectDir?: FileSystemDirectoryHandle
}
