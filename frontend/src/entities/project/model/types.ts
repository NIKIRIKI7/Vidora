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
  concept_id?: string
  angle_type?: string
  thumbnail_visual?: string
  thumbnail_overlay?: string
  psychological_hook?: string
}

export interface PsychologyProfile {
  viewer_fear: string
  viewer_aspiration: string
  skepticism_barrier: string
}

export interface ScriptHookStage {
  spoken: string
  visual_cues: string
}

export interface BestConceptScript {
  concept_id: string
  hook_0_5s: ScriptHookStage
  stakes_5_20s: ScriptHookStage
  open_loop_20_45s: ScriptHookStage
}

export interface TimestampChapter {
  time: string
  label: string
}

export interface SeoMetadata {
  primary_keyword: string
  description_above_fold: string
  description_body: string
  timestamps: TimestampChapter[]
  tags: string[]
  pinned_comment: string
}

export interface ViewerPainItem {
  category: 'question' | 'omission' | 'debate'
  viewer_quote: string
  likes: number
  insight: string
  script_solution: string
}

export interface CommentGoldmineReport {
  unresolved_questions: ViewerPainItem[]
  author_omissions: ViewerPainItem[]
  community_debates: ViewerPainItem[]
  script_counter_theses: string[]
}

export interface CommentGoldmineVideoEntry {
  video_title: string
  report: CommentGoldmineReport
}

export interface DeepTrendAnalysis {
  psychology?: PsychologyProfile
  ideas?: IdeaFormat[]
  best_concept_script?: BestConceptScript
  seo?: SeoMetadata
  blue_ocean_gaps?: BlueOceanOpportunity[]
  comment_goldmine?: CommentGoldmineVideoEntry[]
  conclusions?: string[]
  debug_notes?: string[]
}

export interface HookAnalysisData {
  original_hook?: string
  psychology?: string
  flaws_identified?: string
  stolen_hooks?: Array<string | { angle?: string; hook_0_5s?: string; hook_5_20s?: string; why_it_converts?: string }>
}

export interface VideoResult {
  video_id: string
  title: string
  channel: string
  channel_id?: string
  channel_url?: string
  views: number
  subs: number
  ratio: number
  vph: number
  url: string
  thumbnail_url?: string
  published_at: string
  transcript_sample?: string
  comments_summary?: string
  transcript_status?: 'official_subtitles' | 'whisper_fallback' | 'none'
  vps_score?: number | null
  social_source_url?: string
  duration_sec?: number
  is_short?: boolean
  keyword_found?: string
  m_score?: number
  velocity_stage?: string
  acceleration_pct?: string
  is_rocket?: boolean
  engagement_multiplier?: number
}

export interface MomentumMetrics {
  m_score: number
  velocity_stage: string
  acceleration_pct: string
  engagement_multiplier: number
  is_rocket: boolean
}

export interface BlueOceanOpportunity {
  topic: string
  opportunity_score: number
  status: 'BLUE_OCEAN_UNCONTESTED' | 'MODERATE_GAP' | 'RED_OCEAN_SATURATED'
  max_competitor_similarity: number
  competing_videos_count: number
  demand_source: string
  actionable_angle: string
}

export interface EarlySignalItem {
  id: string
  title: string
  query: string
  vps_score: number
  demand_score: number
  social_velocity: number
  cross_platform_count: number
  source_platform: string
  source_url?: string
  source_title?: string
  breakout: boolean
  growth_pct?: string
  metrics: {
    upvotes?: number
    comments?: number
    bookmarks?: number
    platforms?: string[]
  }
  keywords: string[]
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

export type BRollAudioMode = 'voice' | 'broll' | 'mix'

export interface SceneFragment {
  id: string
  visualNote: string
  text: string
  startTime?: number | null
  endTime?: number | null
  remotionCode?: string
  audioFileName?: string
  bRollFileName?: string
  bRollAudioMode?: BRollAudioMode
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

export type RenderQuality = 'low' | 'medium' | 'high'

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
  renderQuality?: RenderQuality
  use3D?: boolean
  autoBRollEnabled?: boolean
}

export type { DuckingPreset, MusicEqSettings, BackgroundMusicSettings, MusicTrackItem, MusicCategory } from '@shared/config'
