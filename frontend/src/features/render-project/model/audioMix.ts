import type { Scene } from '@entities/project'
import type { BackgroundMusicSettings } from '@shared/config'

/** Полуинтервал кадров [startFrame, endFrame). */
export interface FrameInterval {
  startFrame: number
  endFrame: number
}

export interface VoiceTrack {
  src: string
  /** Обрезка начала файла в кадрах (Remotion `trimBefore`). */
  trimBefore: number
  /** Длительность озвучки сцены в кадрах. */
  durationInFrames: number
}

export interface MusicTrack {
  src: string
  loop: boolean
  /** Громкость в кадре: базовая громкость, ducking под голос и фейды. */
  volumeAt: (frame: number) => number
}

export interface AudioMixPlan {
  /** Дорожки по сценам в порядке рендера; индекс совпадает с индексом сцены. */
  voice: VoiceTrack[][]
  music: MusicTrack | null
  /** Речь в абсолютных кадрах композиции — база для расчёта ducking. */
  speech: FrameInterval[]
}

export type AssetResolver = (assetPath: string) => string

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value))

const lerp = (from: number, to: number, t: number): number => from + (to - from) * t

const toFrames = (seconds: number, fps: number): number =>
  Math.round(Math.max(0, Number.isFinite(seconds) ? seconds : 0) * fps)

/** Склеивает пересекающиеся интервалы: ducking не должен суммироваться. */
export const mergeIntervals = (intervals: FrameInterval[]): FrameInterval[] => {
  const sorted = intervals
    .filter((i) => i.endFrame > i.startFrame)
    .slice()
    .sort((a, b) => a.startFrame - b.startFrame)

  const merged: FrameInterval[] = []
  for (const current of sorted) {
    const last = merged[merged.length - 1]
    if (last && current.startFrame <= last.endFrame) {
      last.endFrame = Math.max(last.endFrame, current.endFrame)
    } else {
      merged.push({ ...current })
    }
  }
  return merged
}

const audioFilesOf = (scene: Scene): string[] => {
  const files = scene.fragments
    .map((f) => f.audioFileName?.trim())
    .filter((name): name is string => Boolean(name))
  return [...new Set(files)]
}

/**
 * Путь озвучки: useAudio уже пишет полный относительный путь, но импортированные
 * проекты могут хранить только имя файла — тогда нужен префикс папки голоса.
 * В отличие от getAudioPathForScene, отсутствие озвучки здесь означает «нет трека»,
 * а не выдуманный путь: иначе рендер ловит 404 на каждый пустой файл.
 */
const sceneVoicePath = (file: string, projectPath: string): string =>
  /[/\\:]/.test(file) ? file : `${projectPath}/assets/voice/${file}`

interface SceneVoicePlan {
  tracks: VoiceTrack[]
  /** Речь внутри сцены в кадрах от её начала. */
  speech: FrameInterval[]
}

const planSceneVoice = (
  scene: Scene,
  fps: number,
  sceneFrames: number,
  projectPath: string,
  resolve: AssetResolver
): SceneVoicePlan => {
  const files = audioFilesOf(scene)
  if (files.length === 0) return { tracks: [], speech: [] }

  // Обычный случай: сцена озвучена одним файлом. При audioMode 'project' это общий
  // файл проекта, а audioOffset хранит, с какой секунды начинается сцена внутри него.
  if (files.length === 1) {
    const trimBefore = toFrames(scene.audioOffset ?? 0, fps)
    return {
      tracks: [{ src: resolve(sceneVoicePath(files[0], projectPath)), trimBefore, durationInFrames: sceneFrames }],
      // Голос занимает всё окно сцены: timeline-смещение здесь не audioOffset,
      // потому что таймкод сцены уже несёт нужное смещение.
      speech: [{ startFrame: 0, endFrame: sceneFrames }],
    }
  }

  // Аварийный вариант: генерация прервалась до конкатенации, у файлов разные куски.
  // Тогда таймкоды фрагментов действительно указывают внутрь своего файла.
  const tracks: VoiceTrack[] = []
  const speech: FrameInterval[] = []

  for (const file of files) {
    const own = scene.fragments.filter((f) => f.audioFileName?.trim() === file)
    const from = toFrames(Math.min(...own.map((f) => (typeof f.startTime === 'number' ? f.startTime : 0))), fps)
    const to = toFrames(Math.max(...own.map((f) => (typeof f.endTime === 'number' ? f.endTime : 0))), fps)
    tracks.push({
      src: resolve(sceneVoicePath(file, projectPath)),
      trimBefore: from,
      durationInFrames: Math.max(1, to - from),
    })
    speech.push({ startFrame: from, endFrame: to })
  }

  return { tracks, speech }
}

/**
 * Громкость музыки по кадрам: ducking под речь с attack/hold/release из настроек
 * пользователя плюс фейды по краям ролика.
 */
const createMusicVolume = (
  speech: FrameInterval[],
  totalFrames: number,
  fps: number,
  music: BackgroundMusicSettings
) => {
  const base = clamp01(music.baseVolume)
  const ducked = clamp01(Math.min(music.baseVolume, music.duckedVolume))
  const attackFrames = toFrames(music.attackMs / 1000, fps)
  const holdFrames = toFrames(music.holdMs / 1000, fps)
  const releaseFrames = toFrames(music.releaseMs / 1000, fps)
  const fadeInFrames = toFrames(music.fadeInSec, fps)
  const fadeOutFrames = toFrames(music.fadeOutSec, fps)
  const intervals = mergeIntervals(speech)

  return (frame: number): number => {
    let volume = base

    for (const interval of intervals) {
      const attackStart = interval.startFrame - attackFrames
      const releaseStart = interval.endFrame + holdFrames

      if (frame < attackStart) break // интервалы отсортированы: дальше тише не станет
      if (frame < interval.startFrame) {
        volume = Math.min(volume, lerp(base, ducked, (frame - attackStart) / Math.max(1, attackFrames)))
      } else if (frame < releaseStart) {
        volume = Math.min(volume, ducked)
      } else if (frame < releaseStart + releaseFrames) {
        volume = Math.min(volume, lerp(ducked, base, (frame - releaseStart) / Math.max(1, releaseFrames)))
      }
    }

    if (fadeInFrames > 0 && frame < fadeInFrames) volume *= frame / fadeInFrames
    if (fadeOutFrames > 0 && frame > totalFrames - fadeOutFrames) {
      volume *= Math.max(0, (totalFrames - frame) / fadeOutFrames)
    }

    return clamp01(volume)
  }
}

export interface BuildAudioMixArgs {
  scenes: Scene[]
  /** Длительность каждой сцены в кадрах, в том же порядке, что и scenes. */
  sceneFrames: number[]
  fps: number
  backgroundMusic?: BackgroundMusicSettings
  /** Относительный путь проекта — папка с ассетами. */
  projectPath: string
  resolve: AssetResolver
}

/**
 * Собирает аудиоплан рендера: озвучка по сценам, музыка и интервалы речи
 * для расчёта ducking. Функция чистая — сетевых запросов нет, пути отдаёт resolve.
 */
export const buildAudioMix = ({
  scenes,
  sceneFrames,
  fps,
  backgroundMusic,
  projectPath,
  resolve,
}: BuildAudioMixArgs): AudioMixPlan => {
  const voice: VoiceTrack[][] = []
  const speech: FrameInterval[] = []
  let cursor = 0

  scenes.forEach((scene, index) => {
    const frames = Math.max(1, Math.round(sceneFrames[index] ?? 0))
    const plan = planSceneVoice(scene, fps, frames, projectPath, resolve)
    voice.push(plan.tracks)
    for (const interval of plan.speech) {
      speech.push({ startFrame: cursor + interval.startFrame, endFrame: cursor + interval.endFrame })
    }
    cursor += frames
  })

  const merged = mergeIntervals(speech)
  const track = backgroundMusic?.customTrackPath?.trim()
  const music: MusicTrack | null =
    backgroundMusic?.enabled && track
      ? {
          src: resolve(track),
          loop: backgroundMusic.loop,
          volumeAt: createMusicVolume(merged, cursor, fps, backgroundMusic),
        }
      : null

  return { voice, music, speech: merged }
}