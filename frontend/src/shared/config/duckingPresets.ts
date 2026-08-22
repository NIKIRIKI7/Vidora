export type DuckingPreset = 'podcast' | 'youtube_tech' | 'shorts_dynamic' | 'cinematic' | 'custom'

export interface MusicEqSettings {
  enableLowCut: boolean
  lowCutFreqHz: number
  enableMidCarve: boolean
  midCarveFreqHz: number
  midCarveGainDb: number
}

export interface BackgroundMusicSettings {
  enabled: boolean
  trackId?: string
  trackName?: string
  customTrackPath?: string
  preset: DuckingPreset
  baseVolume: number
  duckedVolume: number
  threshold: number
  attackMs: number
  releaseMs: number
  holdMs: number
  fadeInSec: number
  fadeOutSec: number
  loop: boolean
  loopCrossfadeSec: number
  eq: MusicEqSettings
}

export interface MusicTrackItem {
  id: string
  name: string
  duration: number
  bpm?: number
  path: string
  is_custom?: boolean
}

export interface MusicCategory {
  category: string
  category_title: string
  tracks: MusicTrackItem[]
}

export const DEFAULT_BACKGROUND_MUSIC: BackgroundMusicSettings = {
  enabled: false,
  preset: 'youtube_tech',
  baseVolume: 0.35,
  duckedVolume: 0.12,
  threshold: 0.08,
  attackMs: 140,
  releaseMs: 600,
  holdMs: 250,
  fadeInSec: 1.0,
  fadeOutSec: 1.5,
  loop: true,
  loopCrossfadeSec: 2.0,
  eq: {
    enableLowCut: true,
    lowCutFreqHz: 80,
    enableMidCarve: true,
    midCarveFreqHz: 2500,
    midCarveGainDb: -3.5,
  },
}

export const DUCKING_PRESETS = {
  youtube_tech: {
    name: 'YouTube Tech (Стандарт)',
    description: 'Энергичный бит в паузах, чистый голос в речи',
    baseVolume: 0.35,
    duckedVolume: 0.12,
    threshold: 0.08,
    attackMs: 140,
    releaseMs: 600,
    holdMs: 250,
    fadeInSec: 1.0,
    fadeOutSec: 1.5,
    eq: {
      enableLowCut: true,
      lowCutFreqHz: 80,
      enableMidCarve: true,
      midCarveFreqHz: 2500,
      midCarveGainDb: -3.5,
    },
  },
  podcast: {
    name: 'Подкаст (Мягкий)',
    description: 'Плавные длинные переходы, ненавязчивый саундтрек',
    baseVolume: 0.25,
    duckedVolume: 0.08,
    threshold: 0.09,
    attackMs: 240,
    releaseMs: 900,
    holdMs: 400,
    fadeInSec: 2.0,
    fadeOutSec: 2.5,
    eq: {
      enableLowCut: true,
      lowCutFreqHz: 100,
      enableMidCarve: true,
      midCarveFreqHz: 2800,
      midCarveGainDb: -4.5,
    },
  },
  shorts_dynamic: {
    name: 'Shorts & Reels (Агрессивный)',
    description: 'Быстрый возврат громкости и плотный микс',
    baseVolume: 0.48,
    duckedVolume: 0.10,
    threshold: 0.06,
    attackMs: 70,
    releaseMs: 350,
    holdMs: 150,
    fadeInSec: 0.3,
    fadeOutSec: 0.8,
    eq: {
      enableLowCut: true,
      lowCutFreqHz: 70,
      enableMidCarve: true,
      midCarveFreqHz: 2200,
      midCarveGainDb: -5.0,
    },
  },
  cinematic: {
    name: 'Cinematic / Фильм',
    description: 'Глубокий пространственный звук и длинные нарастания',
    baseVolume: 0.42,
    duckedVolume: 0.07,
    threshold: 0.07,
    attackMs: 300,
    releaseMs: 1200,
    holdMs: 500,
    fadeInSec: 2.5,
    fadeOutSec: 3.0,
    eq: {
      enableLowCut: false,
      lowCutFreqHz: 40,
      enableMidCarve: true,
      midCarveFreqHz: 3000,
      midCarveGainDb: -3.0,
    },
  },
} as const

export type DuckingPresetKey = keyof typeof DUCKING_PRESETS
